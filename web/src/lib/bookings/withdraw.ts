import type { createServiceClient } from "@/lib/supabase/admin";
import { withdrawSuccessMessage } from "@/lib/copy/bookingCopy";
import { notifyWaitlistPromotedByEmail } from "@/lib/email/notifyWaitlistPromoted";
import { notifyWithdrawByEmail } from "@/lib/email/notifyWithdraw";
import { recordRefundEvent, refundKeyForWithdrawal } from "@/lib/payments/ledger";
import { notifyWhatsAppWaitlistPromoted } from "@/lib/whatsapp/notifyBookingConfirmation";
import Stripe from "stripe";

type Admin = ReturnType<typeof createServiceClient>;

type PromoteRpcRow = {
  promoted_booking_id: string;
  promoted_user_id: string | null;
  promoted_whatsapp_identity_id: string | null;
};

export type WithdrawBookingResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Withdraw a booking (web or WhatsApp).
 *
 * Order of operations matters for money safety:
 * 1. Claim the row: confirmed/waitlist -> 'withdrawing' with a conditional
 *    update. Concurrent withdraw attempts lose the race here (0 rows updated)
 *    instead of both reaching Stripe.
 * 2. Refund via Stripe with a per-booking idempotency key, so even a retried
 *    request can never refund twice.
 * 3. Record the refund in the payment_events ledger.
 * 4. Finalize 'withdrawing' -> 'withdrawn'. If this fails the row stays in
 *    'withdrawing' and is surfaced on the admin needs-attention list.
 *
 * Waitlist withdrawals are refunded in full (no withdrawal fee); confirmed
 * withdrawals keep the session's withdrawal fee.
 */
export async function withdrawBooking(opts: {
  admin: Admin;
  stripe: Stripe;
  playSessionId: string;
  userId?: string;
  whatsappIdentityId?: string;
}): Promise<WithdrawBookingResult> {
  const { admin, stripe, playSessionId, userId, whatsappIdentityId } = opts;

  if (!userId && !whatsappIdentityId) {
    return { ok: false, message: "No booking identity provided." };
  }

  const { data: session, error: sErr } = await admin
    .from("play_sessions")
    .select("id, starts_at, booking_fee_cents, withdrawal_fee_cents, max_players, status")
    .eq("id", playSessionId)
    .single();

  if (sErr || !session) {
    return { ok: false, message: "Session not found." };
  }

  if (session.status !== "open") {
    return { ok: false, message: "This session is no longer open for changes." };
  }

  if (new Date(session.starts_at as string) <= new Date()) {
    return { ok: false, message: "Withdrawals are closed after the session start time." };
  }

  let bookingQuery = admin
    .from("bookings")
    .select("id, status, stripe_payment_intent_id")
    .eq("play_session_id", playSessionId)
    .in("status", ["confirmed", "waitlist"]);

  if (userId) {
    bookingQuery = bookingQuery.eq("user_id", userId);
  } else {
    bookingQuery = bookingQuery.eq("whatsapp_identity_id", whatsappIdentityId!);
  }

  const { data: booking, error: bErr } = await bookingQuery.maybeSingle();

  if (bErr || !booking) {
    return { ok: false, message: "No active booking found for this session." };
  }

  const pi = booking.stripe_payment_intent_id as string | null;
  if (!pi) {
    return { ok: false, message: "No payment on file to refund." };
  }

  const priorStatus = booking.status as "confirmed" | "waitlist";
  const fee = session.booking_fee_cents as number;
  // Waitlist players were never given a spot, so they get every cent back.
  const withdrawFee = priorStatus === "waitlist" ? 0 : (session.withdrawal_fee_cents as number);
  const refundCents = Math.max(0, fee - withdrawFee);
  if (refundCents <= 0) {
    return { ok: false, message: "Refund amount is zero; contact an admin." };
  }

  // Claim the booking. The .eq("status", priorStatus) guard means exactly one
  // concurrent withdraw can win; everyone else updates 0 rows. It also fails
  // if the status changed since we read it (e.g. a promotion raced in), in
  // which case the fee math above could be stale.
  const { data: claimedRows, error: claimErr } = await admin
    .from("bookings")
    .update({ status: "withdrawing", updated_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", priorStatus)
    .select("id");

  if (claimErr) {
    console.error("withdraw claim failed", booking.id, claimErr);
    return { ok: false, message: "Could not start the withdrawal. Please try again." };
  }

  if (!claimedRows || claimedRows.length === 0) {
    return {
      ok: false,
      message:
        "This booking is already being withdrawn, or it just changed. Refresh and try again if needed.",
    };
  }

  const refundKey = refundKeyForWithdrawal(booking.id as string);

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: pi,
        amount: refundCents,
      },
      { idempotencyKey: refundKey }
    );
  } catch (e) {
    console.error("Stripe refund failed", booking.id, e);
    // Release the claim so the player can retry.
    const { error: revertErr } = await admin
      .from("bookings")
      .update({ status: priorStatus, updated_at: new Date().toISOString() })
      .eq("id", booking.id)
      .eq("status", "withdrawing");
    if (revertErr) {
      console.error("withdraw revert failed", booking.id, revertErr);
    }
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Refund failed. Try again or contact support.",
    };
  }

  await recordRefundEvent(admin, {
    bookingId: booking.id as string,
    playSessionId,
    amountCents: refundCents,
    stripeRef: refund.id,
    idempotencyKey: refundKey,
    note: priorStatus === "waitlist" ? "waitlist withdrawal (full refund)" : "withdrawal",
  });

  const { error: finalizeErr } = await admin
    .from("bookings")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "withdrawing");

  if (finalizeErr) {
    // Refund already happened. Leave the row in 'withdrawing' so the admin
    // needs-attention list picks it up; do not promote anyone yet.
    console.error("withdraw finalize failed", booking.id, finalizeErr);
    return {
      ok: true,
      message:
        "Your refund has been issued, but we hit a snag updating the booking. An admin will finish this up — no action needed.",
    };
  }

  // Only a confirmed withdrawal frees a spot for the next waitlisted player.
  if (priorStatus === "confirmed") {
    const { data: promotedRows, error: promErr } = await admin.rpc("promote_next_waitlist", {
      p_play_session_id: playSessionId,
    });

    if (promErr) {
      console.error("promote_next_waitlist", playSessionId, promErr);
    } else {
      const promoted = (promotedRows as PromoteRpcRow[] | null)?.[0];
      if (promoted?.promoted_booking_id) {
        if (promoted.promoted_whatsapp_identity_id) {
          const { data: promotedWa } = await admin
            .from("whatsapp_identities")
            .select("wa_id")
            .eq("id", promoted.promoted_whatsapp_identity_id)
            .maybeSingle();
          const promotedTo = promotedWa?.wa_id as string | undefined;
          if (promotedTo) {
            await notifyWhatsAppWaitlistPromoted({
              admin,
              waId: promotedTo,
              playSessionId,
              bookingId: promoted.promoted_booking_id,
            });
          }
        }

        if (promoted.promoted_user_id) {
          await notifyWaitlistPromotedByEmail({
            admin,
            userId: promoted.promoted_user_id,
            playSessionId,
          });
        }
      }
    }
  }

  const message = withdrawSuccessMessage(refundCents, withdrawFee);

  if (userId) {
    await notifyWithdrawByEmail({
      admin,
      userId,
      message,
      playSessionId,
    });
  }

  return { ok: true, message };
}
