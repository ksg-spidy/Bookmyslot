import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppText } from "@/lib/whatsapp/sendText";
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

  const playSessionId = session.metadata?.play_session_id;
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
    .select("id, max_players, status, title, venue, starts_at")
    .eq("id", playSessionId)
    .single();

  if (pErr || !playSession || playSession.status !== "open") {
    return { ok: false, reason: "invalid_play_session" };
  }

  const { data: existing } = await admin
    .from("bookings")
    .select("id, status")
    .eq("stripe_checkout_session_id", checkoutSessionId)
    .maybeSingle();

  if (existing) {
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

  const { error: insErr } = await admin.from("bookings").insert({
    play_session_id: playSessionId,
    user_id: userId,
    whatsapp_identity_id: whatsappIdentityId,
    status,
    stripe_checkout_session_id: checkoutSessionId,
    stripe_payment_intent_id: paymentIntentId ?? null,
    waitlist_position: waitlistPosition,
  });

  if (insErr) {
    console.error("Booking insert failed", insErr);
    return { ok: false, reason: `insert_failed:${insErr.message}` };
  }

  if (whatsappIdentityId) {
    const { data: wid } = await admin
      .from("whatsapp_identities")
      .select("wa_id")
      .eq("id", whatsappIdentityId)
      .maybeSingle();
    const to = wid?.wa_id as string | undefined;
    if (to) {
      const title = (playSession.title as string) ?? "Session";
      const venue = (playSession.venue as string) ?? "";
      const starts = playSession.starts_at as string;
      const body =
        status === "confirmed"
          ? `ShuttleBook: you are confirmed for ${title}.\n${venue}\nStarts: ${starts}\nPayment received — see you on court.`
          : `ShuttleBook: you are on the waitlist for ${title} (${venue}).\nStarts: ${starts}\nPayment received — we will notify you if a spot opens.`;
      const sent = await sendWhatsAppText(to, body);
      if (!sent.ok) {
        console.error("WhatsApp confirmation failed", sent.error);
      }
    }
  }

  return { ok: true };
}
