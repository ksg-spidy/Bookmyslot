import type { createServiceClient } from "@/lib/supabase/admin";
import { getSessionBookingCounts } from "@/lib/bookings/counts";
import { formatWaitlistPosition } from "@/lib/copy/bookingCopy";
import { formatSessionDateTime, formatSessionRange } from "@/lib/datetime";
import { formatAud } from "@/lib/money";
import { fetchOpenPlaySessions, type OpenPlaySession } from "@/lib/sessions/openSessions";

type Admin = ReturnType<typeof createServiceClient>;

export type ParsedWaCommand = {
  base: string;
  index: number | null;
};

export function parseWaCommand(raw: string): ParsedWaCommand {
  const parts = raw.trim().split(/\s+/);
  const base = parts[0] ?? "";
  const num = parts[1] ? Number.parseInt(parts[1], 10) : NaN;
  return {
    base,
    index: Number.isFinite(num) && num > 0 ? num : null,
  };
}

export type ParsedCommand = {
  base: string;
  index: number | null;
  withdrawSessionId: string | null;
};

export function parseCommand(cmd: string): ParsedCommand {
  if (cmd.startsWith("WITHDRAW_YES:")) {
    return {
      base: "WITHDRAW_YES",
      index: null,
      withdrawSessionId: cmd.slice("WITHDRAW_YES:".length).trim(),
    };
  }
  const { base, index } = parseWaCommand(cmd);
  return { base, index, withdrawSessionId: null };
}

export function isMyBookingsCommand(cmd: string): boolean {
  const upper = cmd.trim().toUpperCase();
  return upper === "MY" || upper === "MY BOOKINGS" || upper.startsWith("MY ");
}

export async function resolveDefaultPlaySessionId(admin: Admin): Promise<string | null> {
  const envId = process.env.WHATSAPP_DEFAULT_PLAY_SESSION_ID?.trim();
  if (envId) {
    const { data } = await admin
      .from("play_sessions")
      .select("id")
      .eq("id", envId)
      .eq("status", "open")
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const { rows } = await fetchOpenPlaySessions(admin);
  return rows?.[0]?.id ?? null;
}

export async function fetchOpenSessionsForWa(admin: Admin): Promise<OpenPlaySession[]> {
  const { rows, error } = await fetchOpenPlaySessions(admin);
  if (error || !rows) return [];
  return rows;
}

export async function resolveOpenSessionByIndex(
  admin: Admin,
  index: number | null
): Promise<{ session: OpenPlaySession } | { sessions: OpenPlaySession[]; needPick: true } | { none: true }> {
  const sessions = await fetchOpenSessionsForWa(admin);
  if (!sessions.length) return { none: true };
  if (sessions.length === 1 && index === null) {
    return { session: sessions[0]! };
  }
  if (index === null) {
    return { sessions, needPick: true };
  }
  const picked = sessions[index - 1];
  if (!picked) return { sessions, needPick: true };
  return { session: picked };
}

export async function buildOpenSessionsListMessage(admin: Admin): Promise<string> {
  const sessions = await fetchOpenSessionsForWa(admin);
  if (!sessions.length) {
    return "No open sessions are available right now. Try again later.";
  }

  const lines = await Promise.all(
    sessions.map(async (s, i) => {
      const counts = await getSessionBookingCounts(admin, s.id, s.max_players);
      const when = formatSessionDateTime(s.starts_at);
      const spots =
        counts.spotsRemaining > 0
          ? `${counts.spotsRemaining} spots left`
          : `Full · ${counts.waitlist} on waitlist`;
      return `${i + 1}. ${s.title}\n   ${when} · ${spots}`;
    })
  );

  return (
    "Open sessions:\n\n" +
    lines.join("\n\n") +
    "\n\nReply BOOK 1, STATUS 2, ROSTER 1, etc. (use the session number)."
  );
}

export async function buildStatusMessage(
  admin: Admin,
  session: OpenPlaySession,
  listIndex?: number
): Promise<string> {
  const counts = await getSessionBookingCounts(admin, session.id, session.max_players);
  const when = formatSessionRange(session.starts_at, session.ends_at);
  const spots =
    counts.spotsRemaining > 0
      ? `${counts.spotsRemaining} of ${session.max_players} spots left`
      : `Full · ${counts.waitlist} on waitlist`;

  const bookHint =
    listIndex != null ? `Reply BOOK ${listIndex} to pay.` : "Reply LIST to see sessions, then BOOK 1 to pay.";

  return [
    session.title,
    session.venue,
    when,
    `Booking fee: ${formatAud(session.booking_fee_cents)}`,
    spots,
    `Booking closes: ${formatSessionDateTime(session.booking_closes_at)}`,
    "",
    bookHint,
  ].join("\n");
}

export function openSessionListIndex(
  sessions: OpenPlaySession[],
  sessionId: string
): number | undefined {
  const idx = sessions.findIndex((s) => s.id === sessionId);
  return idx >= 0 ? idx + 1 : undefined;
}

export async function listWaBookedSessions(
  admin: Admin,
  whatsappIdentityId: string
): Promise<
  { sessions: Array<{ playSessionId: string; title: string; index: number }> } | { none: true }
> {
  const { data: bookings } = await admin
    .from("bookings")
    .select("play_session_id, play_sessions ( id, title, starts_at )")
    .eq("whatsapp_identity_id", whatsappIdentityId)
    .in("status", ["confirmed", "waitlist"])
    .order("created_at", { ascending: false });

  if (!bookings?.length) return { none: true };

  const rows: Array<{ playSessionId: string; title: string; index: number }> = [];
  let n = 0;
  for (const b of bookings) {
    const ps = b.play_sessions as { id?: string; title?: string } | { id?: string; title?: string }[] | null;
    const session = Array.isArray(ps) ? ps[0] : ps;
    if (!session?.id) continue;
    n += 1;
    rows.push({
      playSessionId: session.id,
      title: String(session.title ?? "Session"),
      index: n,
    });
  }

  if (!rows.length) return { none: true };
  return { sessions: rows };
}

export async function buildMyBookingsMessage(
  admin: Admin,
  whatsappIdentityId: string
): Promise<string> {
  const { data: bookings, error } = await admin
    .from("bookings")
    .select(
      "status, waitlist_position, play_sessions ( title, venue, starts_at, ends_at )"
    )
    .eq("whatsapp_identity_id", whatsappIdentityId)
    .in("status", ["confirmed", "waitlist"])
    .order("created_at", { ascending: false });

  if (error || !bookings?.length) {
    return (
      "You have no active bookings.\n\nReply LIST for open sessions or BOOK to pay."
    );
  }

  const lines: string[] = [];
  let n = 0;

  for (const b of bookings) {
    const ps = b.play_sessions as
      | { title?: string; venue?: string; starts_at?: string; ends_at?: string }
      | { title?: string; venue?: string; starts_at?: string; ends_at?: string }[]
      | null;
    const session = Array.isArray(ps) ? ps[0] : ps;
    if (!session?.starts_at || !session.ends_at) continue;

    n += 1;
    const when = formatSessionRange(session.starts_at, session.ends_at);
    const statusLabel =
      b.status === "waitlist"
        ? (formatWaitlistPosition(b.waitlist_position as number | null) ?? "Waitlist")
        : "Confirmed";

    lines.push(
      `${n}. ${String(session.title ?? "Session")}\n   ${when}\n   ${statusLabel}`
    );
  }

  if (!lines.length) {
    return (
      "You have no active bookings.\n\nReply LIST for open sessions or BOOK to pay."
    );
  }

  const footer =
    lines.length === 1
      ? "Reply STATUS for details or WITHDRAW to cancel."
      : "Reply STATUS 1 for details, or WITHDRAW 1 to cancel (use the number above).";

  return `Your bookings:\n\n${lines.join("\n\n")}\n\n${footer}`;
}

export function humanizeFulfillReason(reason: string): string {
  const map: Record<string, string> = {
    payment_not_completed: "Payment has not completed yet.",
    missing_metadata: "Payment could not be linked to a session.",
    play_session_not_found: "This session is no longer available.",
  };
  if (map[reason]) return map[reason];
  if (reason.startsWith("play_session_unavailable")) {
    return "This session is no longer accepting bookings.";
  }
  return "Your booking could not be saved. Contact the organiser with your receipt.";
}
