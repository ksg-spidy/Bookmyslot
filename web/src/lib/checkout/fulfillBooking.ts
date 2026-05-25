import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyWhatsAppBookingConfirmation } from "@/lib/whatsapp/notifyBookingConfirmation";
import type Stripe from "stripe";

type AdminClient = SupabaseClient;

function isCheckoutPaid(session: Pick<Stripe.Checkout.Session, "payment_status" | "status">): boolean {
  return session.payment_status === "paid" || session.status === "complete";
}

export async function fulfillBookingFromCheckoutSession(
  admin: AdminClient,
  session: Pick<
    Stripe.Checkout.Session,
    "id" | "metadata" | "payment_intent" | "payment_status" | "status"
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
    .select("id, max_players, status, title, venue, starts_at, ends_at")
    .eq("id", playSessionId)
    .single();

  if (pErr || !playSession) {
    console.error("play_sessions lookup", playSessionId, pErr);
    return {
      ok: false,
      reason: pErr ? `play_session_lookup:${pErr.message}` : "play_session_not_found",
    };
  }

  // Paid checkout must be fulfilled even if admin locked the slot after checkout started.
  if (playSession.status !== "open" && playSession.status !== "locked") {
    return { ok: false, reason: `play_session_unavailable:${playSession.status}` };
  }

  const { data: existing } = await admin
    .from("bookings")
    .select("id, status")
    .eq("stripe_checkout_session_id", checkoutSessionId)
    .maybeSingle();

  if (existing) {
    if (whatsappIdentityId && (existing.status === "confirmed" || existing.status === "waitlist")) {
      await notifyWhatsAppBookingConfirmation({
        admin,
        whatsappIdentityId,
        playSession: playSession as {
          title: string;
          venue: string;
          starts_at: string;
          ends_at: string;
        },
        status: existing.status as "confirmed" | "waitlist",
      });
    }
    return { ok: true };
  }

  const dup = userId
    ? await admin
        .from("bookings")
        .select("id")
        .eq("play_session_id", playSessionId)
        .eq("user_id", userId)
        .in("status", ["confirmed", "waitlist", "pending_payment"])
        .maybeSingle()
    : await admin
        .from("bookings")
        .select("id")
        .eq("play_session_id", playSessionId)
        .eq("whatsapp_identity_id", whatsappIdentityId)
        .in("status", ["confirmed", "waitlist", "pending_payment"])
        .maybeSingle();

  if (dup.data?.id) {
    return { ok: true };
  }

  const withdrawnRow = userId
    ? await admin
        .from("bookings")
        .select("id")
        .eq("play_session_id", playSessionId)
        .eq("user_id", userId)
        .eq("status", "withdrawn")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : await admin
        .from("bookings")
        .select("id")
        .eq("play_session_id", playSessionId)
        .eq("whatsapp_identity_id", whatsappIdentityId)
        .eq("status", "withdrawn")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const { count: confirmedCount, error: cErr } = await admin
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("play_session_id", playSessionId)
    .eq("status", "confirmed");

  if (cErr) {
    return { ok: false, reason: "count_failed" };
  }

  const confirmed = confirmedCount ?? 0;
  const max = playSession.max_players;

  let status: "confirmed" | "waitlist" = "waitlist";
  let waitlistPosition: number | null = null;

  if (confirmed < max) {
    status = "confirmed";
  } else {
    const { data: wl } = await admin
      .from("bookings")
      .select("waitlist_position")
      .eq("play_session_id", playSessionId)
      .eq("status", "waitlist")
      .order("waitlist_position", { ascending: false })
      .limit(1);

    const nextPos = (wl?.[0]?.waitlist_position ?? 0) + 1;
    waitlistPosition = nextPos;
  }

  const bookingPayload = {
    status,
    stripe_checkout_session_id: checkoutSessionId,
    stripe_payment_intent_id: paymentIntentId ?? null,
    waitlist_position: waitlistPosition,
    updated_at: new Date().toISOString(),
  };

  if (withdrawnRow.data?.id) {
    const { error: updErr } = await admin
      .from("bookings")
      .update(bookingPayload)
      .eq("id", withdrawnRow.data.id);

    if (updErr) {
      console.error("Booking reactivate failed", updErr);
      return { ok: false, reason: `update_failed:${updErr.message}` };
    }
  } else {
    const { error: insErr } = await admin.from("bookings").insert({
      play_session_id: playSessionId,
      user_id: userId,
      whatsapp_identity_id: whatsappIdentityId,
      ...bookingPayload,
    });

    if (insErr) {
      if (insErr.code === "23505") {
        const retryWithdrawn = userId
          ? await admin
              .from("bookings")
              .select("id")
              .eq("play_session_id", playSessionId)
              .eq("user_id", userId)
              .eq("status", "withdrawn")
              .limit(1)
              .maybeSingle()
          : await admin
              .from("bookings")
              .select("id")
              .eq("play_session_id", playSessionId)
              .eq("whatsapp_identity_id", whatsappIdentityId)
              .eq("status", "withdrawn")
              .limit(1)
              .maybeSingle();

        if (retryWithdrawn.data?.id) {
          const { error: retryUpd } = await admin
            .from("bookings")
            .update(bookingPayload)
            .eq("id", retryWithdrawn.data.id);
          if (!retryUpd) {
            // reactivated after unique conflict
          } else {
            return { ok: false, reason: `update_failed:${retryUpd.message}` };
          }
        } else {
          console.error("Booking insert failed", insErr);
          return { ok: false, reason: `insert_failed:${insErr.message}` };
        }
      } else {
        console.error("Booking insert failed", insErr);
        return { ok: false, reason: `insert_failed:${insErr.message}` };
      }
    }
  }

  if (whatsappIdentityId) {
    await notifyWhatsAppBookingConfirmation({
      admin,
      whatsappIdentityId,
      playSession: playSession as {
        title: string;
        venue: string;
        starts_at: string;
        ends_at: string;
      },
      status,
    });
  }

  return { ok: true };
}
