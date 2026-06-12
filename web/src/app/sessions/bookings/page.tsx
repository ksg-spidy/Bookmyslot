import { WithdrawButton } from "@/app/sessions/[id]/WithdrawButton";
import { AddToCalendarLink } from "@/components/AddToCalendarLink";
import { PromotionBanner } from "@/components/PromotionBanner";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/bookings/queries";
import { formatWaitlistPosition } from "@/lib/copy/bookingCopy";
import { formatSessionDateTime, formatSessionRange } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const metadata = {
  title: "My bookings",
};

type SessionInfo = {
  id: string;
  title: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  booking_closes_at: string;
  status: string;
  booking_fee_cents: number;
  withdrawal_fee_cents: number;
};

type BookingRow = {
  id: string;
  status: string;
  waitlist_position: number | null;
  promoted_at: string | null;
  created_at: string;
  play_sessions: SessionInfo | null;
};

function normalizeBookingRows(raw: unknown): BookingRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const ps = r.play_sessions;
    let session: SessionInfo | null = null;
    if (ps && typeof ps === "object") {
      const s = (Array.isArray(ps) ? ps[0] : ps) as Record<string, unknown>;
      if (s?.id) {
        session = {
          id: String(s.id),
          title: String(s.title ?? ""),
          venue: String(s.venue ?? ""),
          starts_at: String(s.starts_at ?? ""),
          ends_at: String(s.ends_at ?? ""),
          booking_closes_at: String(s.booking_closes_at ?? ""),
          status: String(s.status ?? "open"),
          booking_fee_cents: Number(s.booking_fee_cents ?? 0),
          withdrawal_fee_cents: Number(s.withdrawal_fee_cents ?? 0),
        };
      }
    }
    return {
      id: String(r.id),
      status: String(r.status),
      waitlist_position: (r.waitlist_position as number | null) ?? null,
      promoted_at: (r.promoted_at as string | null) ?? null,
      created_at: String(r.created_at),
      play_sessions: session,
    };
  });
}

function canWithdrawBooking(b: BookingRow, nowIso: string): boolean {
  const s = b.play_sessions;
  if (!s) return false;
  const open = s.status === "open" && s.booking_closes_at > nowIso;
  const sessionStarted = s.starts_at <= nowIso;
  return (
    open &&
    !sessionStarted &&
    (b.status === "confirmed" || b.status === "waitlist")
  );
}

export default async function MyBookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date().toISOString();

  const sessionSelect =
    "id, title, venue, starts_at, ends_at, booking_closes_at, status, booking_fee_cents, withdrawal_fee_cents";

  const { data: active, error: activeErr } = await supabase
    .from("bookings")
    .select(`id, status, waitlist_position, promoted_at, created_at, play_sessions ( ${sessionSelect} )`)
    .eq("user_id", user.id)
    .in("status", [...ACTIVE_BOOKING_STATUSES])
    .order("created_at", { ascending: false });

  const { data: past, error: pastErr } = await supabase
    .from("bookings")
    .select(`id, status, waitlist_position, promoted_at, created_at, play_sessions ( ${sessionSelect} )`)
    .eq("user_id", user.id)
    .eq("status", "withdrawn")
    .order("created_at", { ascending: false })
    .limit(20);

  if (activeErr || pastErr) {
    return (
      <p className="text-sm text-red-400">
        Could not load bookings. Please try again later.
      </p>
    );
  }

  const activeRows = normalizeBookingRows(active);
  const upcoming = activeRows.filter(
    (b) => b.play_sessions && b.play_sessions.starts_at > now
  );
  const inProgressOrPastActive = activeRows.filter(
    (b) => b.play_sessions && b.play_sessions.starts_at <= now
  );

  function BookingList({
    rows,
    empty,
    showWithdraw,
  }: {
    rows: BookingRow[];
    empty: string;
    showWithdraw?: boolean;
  }) {
    if (!rows.length) {
      return <p className="mt-2 text-sm text-muted">{empty}</p>;
    }
    return (
      <ul className="mt-3 space-y-3">
        {rows.map((b) => {
          const s = b.play_sessions;
          if (!s) return null;
          const withdraw = showWithdraw && canWithdrawBooking(b, now);
          return (
            <li
              key={b.id}
              className="rounded-lg border border-edge bg-card transition hover:border-link"
            >
              {b.promoted_at ? (
                <div className="p-4 pb-0">
                  <PromotionBanner bookingId={b.id} promotedAt={b.promoted_at} />
                </div>
              ) : null}
              <Link href={`/sessions/${s.id}`} className="block p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-white">{s.title}</span>
                  <span className="shrink-0 text-xs capitalize text-success">{b.status}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{s.venue}</p>
                <p className="mt-2 text-sm text-white">
                  {formatSessionRange(s.starts_at, s.ends_at)}
                </p>
                {b.status === "waitlist" && b.waitlist_position != null ? (
                  <p className="mt-1 text-xs text-muted">
                    {formatWaitlistPosition(b.waitlist_position)}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  Booked {formatSessionDateTime(b.created_at)}
                </p>
              </Link>
              <div className="border-t border-edge px-4 py-2 space-y-2">
                <AddToCalendarLink sessionId={s.id} />
                {withdraw ? (
                  <WithdrawButton
                    sessionId={s.id}
                    bookingFeeCents={s.booking_fee_cents}
                    withdrawalFeeCents={s.withdrawal_fee_cents}
                    canWithdraw
                    isWaitlist={b.status === "waitlist"}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">My bookings</h1>
      <p className="mt-1 text-sm text-muted">
        Upcoming sessions you are booked or waitlisted for. Withdraw from here or open a session for
        details.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-white">Upcoming</h2>
        <BookingList rows={upcoming} empty="No upcoming bookings." showWithdraw />
      </section>

      {inProgressOrPastActive.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium text-white">Active (session started)</h2>
          <BookingList rows={inProgressOrPastActive} empty="" />
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-medium text-white">Withdrawn</h2>
        <BookingList rows={normalizeBookingRows(past)} empty="No withdrawn bookings." />
      </section>

      <Link href="/sessions" className="mt-8 inline-block text-sm text-link hover:underline">
        Browse open sessions →
      </Link>
    </div>
  );
}
