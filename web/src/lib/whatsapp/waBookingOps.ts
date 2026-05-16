import type { createServiceClient } from "@/lib/supabase/admin";
import { sendWhatsAppText } from "@/lib/whatsapp/sendText";
import Stripe from "stripe";

type Admin = ReturnType<typeof createServiceClient>;

export async function buildRosterMessage(
  admin: Admin,
  playSessionId: string,
  viewerWhatsappIdentityId: string
): Promise<string | null> {
  const { data: session } = await admin
    .from("play_sessions")
    .select("title, venue, starts_at, max_players")
    .eq("id", playSessionId)
    .maybeSingle();
  if (!session) return null;

  const { data: rows, error } = await admin
    .from("bookings")
    .select("id, status, waitlist_position, user_id, whatsapp_identity_id, created_at")
    .eq("play_session_id", playSessionId)
    .in("status", ["confirmed", "waitlist"]);

  if (error) {
    console.error("roster query", error);
    return "Could not load the roster right now.";
  }

  const list = rows ?? [];
  const userIds = [...new Set(list.map((b) => b.user_id).filter(Boolean))] as string[];
  const waIdentityIds = [...new Set(list.map((b) => b.whatsapp_identity_id).filter(Boolean))] as string[];

  const nameByUserId = new Map<string, string>();
  const nameByWaIdentityId = new Map<string, string>();

  if (userIds.length) {
    const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", userIds);
    for (const p of profs ?? []) {
      const n = (p.full_name as string | null)?.trim();
      if (n) nameByUserId.set(p.id as string, n);
    }
  }

  if (waIdentityIds.length) {
    const { data: was } = await admin
      .from("whatsapp_identities")
      .select("id, display_name")
      .in("id", waIdentityIds);
    for (const w of was ?? []) {
      const n = (w.display_name as string | null)?.trim();
      if (n) nameByWaIdentityId.set(w.id as string, n);
    }
  }

  function displayName(row: (typeof list)[0]): string {
    if (row.user_id) {
      const n = nameByUserId.get(row.user_id as string);
      if (n) return n;
    }
    if (row.whatsapp_identity_id) {
      const n = nameByWaIdentityId.get(row.whatsapp_identity_id as string);
      if (n) return n;
    }
    return "Player";
  }

  const sorted = [...list].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "confirmed" ? -1 : 1;
    }
    const ap = (a.waitlist_position as number | null) ?? 9999;
    const bp = (b.waitlist_position as number | null) ?? 9999;
    if (ap !== bp) return ap - bp;
    return String(a.created_at).localeCompare(String(b.created_at));
  });

  const confirmed = sorted.filter((b) => b.status === "confirmed");
  const waitlisted = sorted.filter((b) => b.status === "waitlist");

  let body = `${session.title}\n${session.venue}\nStarts: ${session.starts_at}\n\n`;
  if (confirmed.length) {
    body += "Confirmed:\n";
    confirmed.forEach((b, i) => {
      const name = displayName(b);
      const you = b.whatsapp_identity_id === viewerWhatsappIdentityId ? " (you)" : "";
      body += `${i + 1}. ${name}${you} ✓\n`;
    });
  } else {
    body += "No confirmed players yet.\n";
  }
  if (waitlisted.length) {
    body += "\nWaitlist:\n";
    waitlisted.forEach((b, i) => {
      const name = displayName(b);
      const you = b.whatsapp_identity_id === viewerWhatsappIdentityId ? " (you)" : "";
      body += `${i + 1}. ${name}${you}\n`;
    });
  }
  const max = session.max_players as number;
  body += `\nSpots: ${confirmed.length} / ${max} filled.`;
  return body.trimEnd();
}

export async function withdrawWhatsappBooking(opts: {
  admin: Admin;
  stripe: Stripe;
  playSessionId: string;
  whatsappIdentityId: string;
  waId: string;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const { admin, stripe, playSessionId, whatsappIdentityId } = opts;

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

  if (new Date(session.starts_at) <= new Date()) {
    return { ok: false, message: "Withdrawals are closed after the session start time." };
  }

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, status, stripe_payment_intent_id")
    .eq("play_session_id", playSessionId)
    .eq("whatsapp_identity_id", whatsappIdentityId)
    .in("status", ["confirmed", "waitlist"])
    .maybeSingle();

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
      .select("id, whatsapp_identity_id")
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
    }
  }

  const refundDollars = (refundCents / 100).toFixed(2);
  const feeDollars = (withdrawFee / 100).toFixed(2);
  return {
    ok: true,
    message: `Booking cancelled. A $${feeDollars} cancellation fee was kept; $${refundDollars} is refunded to your card.`,
  };
}
