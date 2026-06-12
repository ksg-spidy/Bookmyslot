import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyBookingConfirmedByEmail } from "@/lib/email/notifyBookingConfirmed";
import { chargeKeyForCheckout, recordChargeEvent } from "@/lib/payments/ledger";
import { notifyWhatsAppBookingConfirmation } from "@/lib/whatsapp/notifyBookingConfirmation";
import type Stripe from "stripe";

type AdminClient = SupabaseClient;

type FulfillRpcRow = {
  booking_id: string;
  status: string;
  waitlist_position: number | null;
  is_new: boolean;
};

function isCheckoutPaid(session: Pick<Stripe.Checkout.Session, "payment_status">): boolean {
  return session.payment_status === "paid";
}

export async function fulfillBookingFromCheckoutSession(
  admin: AdminClient,
  session: Pick<
    Stripe.Checkout.Session,
    "id" | "metadata" | "payment_intent" | "payment_status" | "status" | "amount_total"
  >
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isCheckoutPaid(session)) {
    return { ok: false, reason: "payment_not_completed" };
  }

  const playSessionId = session.metadata?.play_session_id?.trim();
  const userId = session.metadata?.user_id ?? null;
  const whatsappIdentityId = session.metadata?.whatsapp_identity_id ?? null;
  const checkoutSessionId = session.id;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!playSessionId || !(userId || whatsappIdentityId) || !checkoutSessionId) {
    return { ok: false, reason: "missing_metadata" };
  }

  const { data: playSession, error: pErr } = await admin
    .from("play_sessions")
    .select("id, max_players, status, title, venue, starts_at, ends_at, booking_fee_cents")
    .eq("id", playSessionId)
    .single();

  if (pErr || !playSession) {
    console.error("play_sessions lookup", playSessionId, pErr);
    return {
      ok: false,
      reason: pErr ? `play_session_lookup:${pErr.message}` : "play_session_not_found",
    };
  }

  if (playSession.status !== "open" && playSession.status !== "locked") {
    return { ok: false, reason: `play_session_unavailable:${playSession.status}` };
  }

  // The amount the player actually paid. amount_total comes from Stripe;
  // the session fee is only a fallback for malformed test events.
  const paidCents = session.amount_total ?? (playSession.booking_fee_cents as number);

  const { data: existing } = await admin
    .from("bookings")
    .select("id, status, waitlist_position")
    .eq("stripe_checkout_session_id", checkoutSessionId)
    .maybeSingle();

  if (existing) {
    // Healing path: if an earlier fulfillment crashed between booking write and
    // ledger write, this idempotent insert repairs the ledger.
    await recordChargeEvent(admin, {
      bookingId: existing.id as string,
      playSessionId,
      amountCents: paidCents,
      stripeRef: paymentIntentId ?? checkoutSessionId,
      idempotencyKey: chargeKeyForCheckout(checkoutSessionId),
    });
    if (whatsappIdentityId && (existing.status === "confirmed" || existing.status === "waitlist")) {
      await notifyWhatsAppBookingConfirmation({
        admin,
        whatsappIdentityId,
        playSessionId,
        playSession: playSession as {
          title: string;
          venue: string;
          starts_at: string;
          ends_at: string;
        },
        status: existing.status as "confirmed" | "waitlist",
        waitlistPosition: (existing.waitlist_position as number | null) ?? null,
      });
    }
    return { ok: true };
  }

  const { data: rpcRows, error: rpcErr } = await admin.rpc("fulfill_booking_atomic", {
    p_play_session_id: playSessionId,
    p_user_id: userId,
    p_whatsapp_identity_id: whatsappIdentityId,
    p_stripe_checkout_session_id: checkoutSessionId,
    p_stripe_payment_intent_id: paymentIntentId ?? null,
  });

  if (rpcErr) {
    console.error("fulfill_booking_atomic", checkoutSessionId, rpcErr);
    const msg = rpcErr.message ?? "fulfill_rpc_failed";
    if (msg.includes("play_session_not_found")) {
      return { ok: false, reason: "play_session_not_found" };
    }
    if (msg.includes("play_session_unavailable")) {
      return { ok: false, reason: msg };
    }
    return { ok: false, reason: `fulfill_rpc:${msg}` };
  }

  const row = (rpcRows as FulfillRpcRow[] | null)?.[0];
  if (!row?.booking_id) {
    return { ok: false, reason: "fulfill_empty" };
  }

  const status = row.status as "confirmed" | "waitlist";
  const waitlistPosition = row.waitlist_position;

  await recordChargeEvent(admin, {
    bookingId: row.booking_id,
    playSessionId,
    amountCents: paidCents,
    stripeRef: paymentIntentId ?? checkoutSessionId,
    idempotencyKey: chargeKeyForCheckout(checkoutSessionId),
  });

  if (!row.is_new) {
    return { ok: true };
  }

  if (whatsappIdentityId) {
    await notifyWhatsAppBookingConfirmation({
      admin,
      whatsappIdentityId,
      playSessionId,
      playSession: playSession as {
        title: string;
        venue: string;
        starts_at: string;
        ends_at: string;
      },
      status,
      waitlistPosition,
    });
  }

  if (userId) {
    await notifyBookingConfirmedByEmail({
      admin,
      userId,
      playSessionId,
      status,
      waitlistPosition,
    });
  }

  return { ok: true };
}

