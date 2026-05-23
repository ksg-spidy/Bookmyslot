import type { createServiceClient } from "@/lib/supabase/admin";
import { notifyWaitlistPromotedByEmail } from "@/lib/email/notifyWaitlistPromoted";
import { sendWhatsAppText } from "@/lib/whatsapp/sendText";
import Stripe from "stripe";

type Admin = ReturnType<typeof createServiceClient>;

export type WithdrawBookingResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

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

  const fee = session.booking_fee_cents as number;
  const withdrawFee = session.withdrawal_fee_cents as number;
  const refundCents = Math.max(0, fee - withdrawFee);
  if (refundCents <= 0) {
    return { ok: false, message: "Refund amount is zero; contact an admin." };
  }

  try {
    await stripe.refunds.create({
      payment_intent: pi,
      amount: refundCents,
    });
  } catch (e) {
    console.error("Stripe refund failed", e);
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Refund failed. Try again or contact support.",
    };
  }

  const { error: uErr } = await admin
    .from("bookings")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", booking.id);

  if (uErr) {
    console.error("withdraw update failed", uErr);
    return { ok: false, message: "Refund succeeded but booking update failed. Contact support." };
  }

  const max = session.max_players as number;
  const { count: confirmedAfter, error: cErr } = await admin
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("play_session_id", playSessionId)
    .eq("status", "confirmed");

  if (!cErr && (confirmedAfter ?? 0) < max) {
    const { data: nextWl } = await admin
      .from("bookings")
      .select("id, user_id, whatsapp_identity_id")
      .eq("play_session_id", playSessionId)
      .eq("status", "waitlist")
      .order("waitlist_position", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (nextWl?.id) {
      await admin
        .from("bookings")
        .update({ status: "confirmed", waitlist_position: null, updated_at: new Date().toISOString() })
        .eq("id", nextWl.id);

      if (nextWl.whatsapp_identity_id) {
        const { data: promotedWa } = await admin
          .from("whatsapp_identities")
          .select("wa_id")
          .eq("id", nextWl.whatsapp_identity_id)
          .maybeSingle();
        const promotedTo = promotedWa?.wa_id as string | undefined;
        if (promotedTo) {
          await sendWhatsAppText(
            promotedTo,
            "ShuttleBook: a spot opened up — you are now confirmed for the session. See you on court."
          );
        }
      }

      const promotedUserId = nextWl.user_id as string | null;
      if (promotedUserId) {
        await notifyWaitlistPromotedByEmail({
          admin,
          userId: promotedUserId,
          playSessionId,
        });
      }
    }
  }

  const refundDollars = (refundCents / 100).toFixed(2);
  const feeDollars = (withdrawFee / 100).toFixed(2);
  return {
    ok: true,
    message: `Booking cancelled. A $${feeDollars} cancellation fee was kept; $${refundDollars} is refunded to your card.`,
  };
}
