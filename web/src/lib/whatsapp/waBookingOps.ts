import { withdrawBooking } from "@/lib/bookings/withdraw";
import type { createServiceClient } from "@/lib/supabase/admin";
import { formatSessionDateTime } from "@/lib/datetime";
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

  // Privacy gate: player names are only shown to someone who is actually
  // booked into this session (directly via WhatsApp, or via their linked web
  // profile) — not to any phone number that texts the bot.
  const { data: viewerIdentity } = await admin
    .from("whatsapp_identities")
    .select("profile_id")
    .eq("id", viewerWhatsappIdentityId)
    .maybeSingle();
  const viewerProfileId = viewerIdentity?.profile_id as string | null | undefined;

  const viewerIsBooked = list.some(
    (b) =>
      b.whatsapp_identity_id === viewerWhatsappIdentityId ||
      (viewerProfileId != null && b.user_id === viewerProfileId)
  );

  if (!viewerIsBooked) {
    return "The roster is only visible to booked players. Reply LIST to see open sessions, then BOOK to join.";
  }
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
    let name = "Player";
    if (row.user_id) {
      const n = nameByUserId.get(row.user_id as string);
      if (n) name = n;
    } else if (row.whatsapp_identity_id) {
      const n = nameByWaIdentityId.get(row.whatsapp_identity_id as string);
      if (n) name = n;
    }
    const channel = row.user_id ? "website" : "WhatsApp";
    return `${name} (${channel})`;
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

  let body = `${session.title}\n${session.venue}\n${formatSessionDateTime(session.starts_at as string)}\n\n`;
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
  return withdrawBooking({ admin, stripe, playSessionId, whatsappIdentityId });
}
