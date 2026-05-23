import type { SessionBookingCounts } from "@/lib/bookings/counts";
import { formatSessionDateTime, formatSessionRange, getBookingTimezoneLabel } from "@/lib/datetime";
import { formatAud } from "@/lib/money";

type Session = {
  title: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  booking_closes_at: string;
  max_players: number;
  booking_fee_cents: number;
  withdrawal_fee_cents: number;
};

export function SessionDetailBody({
  session,
  counts,
}: {
  session: Session;
  counts: SessionBookingCounts;
}) {
  const full = counts.spotsRemaining <= 0;

  return (
    <>
      <h1 className="mt-4 text-2xl font-semibold text-white">{session.title}</h1>
      <p className="mt-2 text-[#8b949e]">
        {session.venue}
        {session.venue.trim() ? (
          <>
            {" "}
            ·{" "}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(session.venue)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#58a6ff] hover:underline"
            >
              Map
            </a>
          </>
        ) : null}
      </p>
      <p className="mt-2 text-sm text-white">{formatSessionRange(session.starts_at, session.ends_at)}</p>
      <p className="mt-3 text-sm text-white">
        <span
          className={`mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            full ? "bg-[#3d2a00] text-[#f0c93a]" : "bg-[#0c2218] text-[#3fb950]"
          }`}
        >
          {full
            ? `Full · ${counts.confirmed}/${session.max_players} confirmed`
            : `${counts.spotsRemaining} of ${session.max_players} spots left`}
        </span>
        {counts.waitlist > 0 ? (
          <span className="text-[#8b949e]"> · {counts.waitlist} on waitlist</span>
        ) : null}
      </p>
      <p className="mt-4 text-sm text-white">
        Booking fee: <strong>{formatAud(session.booking_fee_cents)}</strong> · Cancellation fee:{" "}
        <strong>{formatAud(session.withdrawal_fee_cents)}</strong>
      </p>
      <p className="mt-1 text-sm text-[#8b949e]">
        Booking closes {formatSessionDateTime(session.booking_closes_at)} ({getBookingTimezoneLabel()}
        ). If the session is full, you join the waitlist and pay the same fee; you are charged only when
        you book.
      </p>
    </>
  );
}
