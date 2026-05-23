import { AddToCalendarLink } from "@/components/AddToCalendarLink";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/bookings/queries";
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
};

type BookingRow = {
  id: string;
  status: string;
  waitlist_position: number | null;
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
        };
      }
    }
    return {
      id: String(r.id),
      status: String(r.status),
      waitlist_position: (r.waitlist_position as number | null) ?? null,
      created_at: String(r.created_at),
      play_sessions: session,
    };
  });
}

export default async function MyBookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date().toISOString();

  const { data: active, error: activeErr } = await supabase
    .from("bookings")
    .select(
      "id, status, waitlist_position, created_at, play_sessions ( id, title, venue, starts_at, ends_at, booking_closes_at )"
    )
    .eq("user_id", user.id)
    .in("status", [...ACTIVE_BOOKING_STATUSES])
    .order("created_at", { ascending: false });

  const { data: past, error: pastErr } = await supabase
    .from("bookings")
    .select(
      "id, status, waitlist_position, created_at, play_sessions ( id, title, venue, starts_at, ends_at, booking_closes_at )"
    )
    .eq("user_id", user.id)
    .eq("status", "withdrawn")
    .order("created_at", { ascending: false })
    .limit(20);

  if (activeErr || pastErr) {
    return (
      <p className="text-sm text-red-400">
        Could not load bookings. ({activeErr?.message ?? pastErr?.message})
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

  function BookingList({ rows, empty }: { rows: BookingRow[]; empty: string }) {
    if (!rows.length) {
      return <p className="mt-2 text-sm text-[#8b949e]">{empty}</p>;
    }
    return (
      <ul className="mt-3 space-y-3">
        {rows.map((b) => {
          const s = b.play_sessions;
          if (!s) return null;
          return (
            <li
              key={b.id}
              className="rounded-lg border border-[#30363d] bg-[#161b22] transition hover:border-[#58a6ff]"
            >
              <Link href={`/sessions/${s.id}`} className="block p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-white">{s.title}</span>
                  <span className="shrink-0 text-xs capitalize text-[#3fb950]">{b.status}</span>
                </div>
                <p className="mt-1 text-sm text-[#8b949e]">{s.venue}</p>
                <p className="mt-2 text-sm text-white">
                  {formatSessionRange(s.starts_at, s.ends_at)}
                </p>
                {b.status === "waitlist" && b.waitlist_position != null ? (
                  <p className="mt-1 text-xs text-[#8b949e]">Waitlist position #{b.waitlist_position}</p>
                ) : null}
                <p className="mt-2 text-xs text-[#8b949e]">
                  Booked {formatSessionDateTime(b.created_at)}
                </p>
              </Link>
              <div className="border-t border-[#30363d] px-4 py-2">
                <AddToCalendarLink sessionId={s.id} />
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
      <p className="mt-1 text-sm text-[#8b949e]">
        Upcoming sessions you are booked or waitlisted for. Open a session to cancel or rebook.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-white">Upcoming</h2>
        <BookingList rows={upcoming} empty="No upcoming bookings." />
      </section>

      {inProgressOrPastActive.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium text-white">Active (session started)</h2>
          <BookingList rows={inProgressOrPastActive} empty="" />
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-medium text-white">Cancelled</h2>
        <BookingList rows={normalizeBookingRows(past)} empty="No cancelled bookings." />
      </section>

      <Link href="/sessions" className="mt-8 inline-block text-sm text-[#58a6ff] hover:underline">
        Browse open sessions →
      </Link>
    </div>
  );
}
