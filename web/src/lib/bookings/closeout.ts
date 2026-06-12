import type { createServiceClient } from "@/lib/supabase/admin";
import { notifyWithdrawByEmail } from "@/lib/email/notifyWithdraw";
import { recordRefundEvent, refundKeyForCloseout } from "@/lib/payments/ledger";
import { sendWhatsAppText } from "@/lib/whatsapp/sendText";
import Stripe from "stripe";

type Admin = ReturnType<typeof createServiceClient>;

export type CloseoutResult = {
  ok: boolean;
  refunded: number;
  failed: number;
  message: string;
};

export type CloseoutSweepResult = {
  ok: boolean;
  sessionsProcessed: number;
  refunded: number;
  failed: number;
  details: { playSessionId: string; result: CloseoutResult }[];
};

function closeoutPlayerMessage(title: string): string {
  return `The session "${title}" has started and a spot did not open up, so your waitlist booking was refunded in full to your card.`;
}

/**
 * Close out one session: refund every remaining paid waitlist booking in full
 * (they never got a spot), then stamp closed_out_at.
 *
 * Money safety mirrors withdrawBooking: each booking is claimed
 * (waitlist -> withdrawing) before the refund so a concurrent closeout (cron +
 * admin button) cannot double-refund, the Stripe refund uses a per-booking
 * idempotency key, and the ledger records every refund. closed_out_at is only
 * set when every waitlist booking was processed, so a partial failure is
 * retried by the next cron run (idempotency keys make retries safe).
 */
export async function closeOutSession(opts: {
  admin: Admin;
  stripe: Stripe;
  playSessionId: string;
}): Promise<CloseoutResult> {
  const { admin, stripe, playSessionId } = opts;

  const { data: session, error: sErr } = await admin
    .from("play_sessions")
    .select("id, title, starts_at, booking_fee_cents, closed_out_at")
    .eq("id", playSessionId)
    .single();

  if (sErr || !session) {
    return { ok: false, refunded: 0, failed: 0, message: "Session not found." };
  }

  if (session.closed_out_at) {
    return { ok: true, refunded: 0, failed: 0, message: "Session already closed out." };
  }

  if (new Date(session.starts_at as string) > new Date()) {
    return { ok: false, refunded: 0, failed: 0, message: "Session has not started yet." };
  }

  const { data: waitlisted, error: wErr } = await admin
    .from("bookings")
    .select("id, status, stripe_payment_intent_id, user_id, whatsapp_identity_id")
    .eq("play_session_id", playSessionId)
    .eq("status", "waitlist");

  if (wErr) {
    console.error("closeout: waitlist query failed", playSessionId, wErr);
    return { ok: false, refunded: 0, failed: 0, message: "Could not load waitlist bookings." };
  }

  let refunded = 0;
  let failed = 0;

  for (const booking of waitlisted ?? []) {
    const outcome = await refundWaitlistBookingForCloseout({
      admin,
      stripe,
      playSessionId,
      sessionTitle: (session.title as string) ?? "your session",
      bookingFeeCents: session.booking_fee_cents as number,
      booking: booking as {
        id: string;
        stripe_payment_intent_id: string | null;
        user_id: string | null;
        whatsapp_identity_id: string | null;
      },
    });
    if (outcome) refunded += 1;
    else failed += 1;
  }

  if (failed > 0) {
    return {
      ok: false,
      refunded,
      failed,
      message: `Refunded ${refunded} waitlist booking(s); ${failed} failed. Session left open for retry.`,
    };
  }

  const { error: closeErr } = await admin
    .from("play_sessions")
    .update({ closed_out_at: new Date().toISOString() })
    .eq("id", playSessionId)
    .is("closed_out_at", null);

  if (closeErr) {
    console.error("closeout: stamp failed", playSessionId, closeErr);
    return {
      ok: false,
      refunded,
      failed,
      message: `Refunded ${refunded} waitlist booking(s) but could not mark the session closed out.`,
    };
  }

  return {
    ok: true,
    refunded,
    failed: 0,
    message:
      refunded > 0
        ? `Closed out: refunded ${refunded} waitlist booking(s) in full.`
        : "Closed out: no waitlist bookings to refund.",
  };
}

async function refundWaitlistBookingForCloseout(opts: {
  admin: Admin;
  stripe: Stripe;
  playSessionId: string;
  sessionTitle: string;
  bookingFeeCents: number;
  booking: {
    id: string;
    stripe_payment_intent_id: string | null;
    user_id: string | null;
    whatsapp_identity_id: string | null;
  };
}): Promise<boolean> {
  const { admin, stripe, playSessionId, sessionTitle, bookingFeeCents, booking } = opts;

  if (!booking.stripe_payment_intent_id) {
    console.error("closeout: waitlist booking has no payment intent", booking.id);
    return false;
  }

  // Claim: only one closeout path may own this booking.
  const { data: claimed, error: claimErr } = await admin
    .from("bookings")
    .update({ status: "withdrawing", updated_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "waitlist")
    .select("id");

  if (claimErr || !claimed || claimed.length === 0) {
    if (claimErr) console.error("closeout: claim failed", booking.id, claimErr);
    return false;
  }

  const refundKey = refundKeyForCloseout(booking.id);

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: booking.stripe_payment_intent_id,
        amount: bookingFeeCents,
      },
      { idempotencyKey: refundKey }
    );
  } catch (e) {
    console.error("closeout: Stripe refund failed", booking.id, e);
    const { error: revertErr } = await admin
      .from("bookings")
      .update({ status: "waitlist", updated_at: new Date().toISOString() })
      .eq("id", booking.id)
      .eq("status", "withdrawing");
    if (revertErr) console.error("closeout: revert failed", booking.id, revertErr);
    return false;
  }

  await recordRefundEvent(admin, {
    bookingId: booking.id,
    playSessionId,
    amountCents: bookingFeeCents,
    stripeRef: refund.id,
    idempotencyKey: refundKey,
    note: "closeout: unpromoted waitlist refunded in full",
  });

  const { error: finalizeErr } = await admin
    .from("bookings")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "withdrawing");

  if (finalizeErr) {
    // Refund happened; the stuck 'withdrawing' row surfaces on admin needs-attention.
    console.error("closeout: finalize failed", booking.id, finalizeErr);
    return false;
  }

  const message = closeoutPlayerMessage(sessionTitle);

  if (booking.user_id) {
    await notifyWithdrawByEmail({
      admin,
      userId: booking.user_id,
      message,
      playSessionId,
    });
  }

  if (booking.whatsapp_identity_id) {
    const { data: wid } = await admin
      .from("whatsapp_identities")
      .select("wa_id")
      .eq("id", booking.whatsapp_identity_id)
      .maybeSingle();
    const to = wid?.wa_id as string | undefined;
    if (to) {
      const sent = await sendWhatsAppText(to, `ShuttleBook: ${message}`);
      if (!sent.ok) console.error("closeout: WhatsApp notify failed", booking.id, sent.error);
    }
  }

  return true;
}

/** Close out every session that has started but was never swept (cron entry point). */
export async function closeOutDueSessions(opts: {
  admin: Admin;
  stripe: Stripe;
}): Promise<CloseoutSweepResult> {
  const { admin, stripe } = opts;

  const { data: due, error } = await admin
    .from("play_sessions")
    .select("id")
    .lte("starts_at", new Date().toISOString())
    .is("closed_out_at", null);

  if (error) {
    console.error("closeout sweep: query failed", error);
    return { ok: false, sessionsProcessed: 0, refunded: 0, failed: 0, details: [] };
  }

  const details: CloseoutSweepResult["details"] = [];
  let refunded = 0;
  let failed = 0;

  for (const row of due ?? []) {
    const result = await closeOutSession({ admin, stripe, playSessionId: row.id as string });
    details.push({ playSessionId: row.id as string, result });
    refunded += result.refunded;
    failed += result.failed;
  }

  return {
    ok: failed === 0,
    sessionsProcessed: (due ?? []).length,
    refunded,
    failed,
    details,
  };
}
