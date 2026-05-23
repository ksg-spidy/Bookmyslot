import type { SessionBookingCounts } from "@/lib/bookings/counts";
import { formatSessionDateTime, formatSessionRange } from "@/lib/datetime";
import { formatAud } from "@/lib/money";
import Link from "next/link";

type Session = {
  id: string;
  title: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  booking_closes_at: string;
  booking_fee_cents: number;
  max_players: number;
};

function spotsLabel(counts: SessionBookingCounts, maxPlayers: number): string {
  if (counts.spotsRemaining <= 0) {
    const wl = counts.waitlist > 0 ? ` · ${counts.waitlist} on waitlist` : "";
    return `Full${wl}`;
  }
  return `${counts.spotsRemaining} of ${maxPlayers} spots left`;
}

export function SessionCard({
  session,
  href,
  counts,
}: {
  session: Session;
  href: string;
  counts: SessionBookingCounts;
}) {
  const full = counts.spotsRemaining <= 0;

  return (
    <Link
      href={href}
      className="block rounded-lg border border-[#30363d] bg-[#161b22] p-4 transition hover:border-[#58a6ff]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="font-medium text-white">{session.title}</div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            full ? "bg-[#3d2a00] text-[#f0c93a]" : "bg-[#0c2218] text-[#3fb950]"
          }`}
        >
          {full ? "Full" : `${counts.spotsRemaining} left`}
        </span>
      </div>
      <div className="mt-1 text-sm text-[#8b949e]">{session.venue}</div>
      <div className="mt-2 text-sm text-white">{formatSessionRange(session.starts_at, session.ends_at)}</div>
      <div className="mt-2 text-xs text-[#8b949e]">
        {formatAud(session.booking_fee_cents)} · {spotsLabel(counts, session.max_players)} · booking closes{" "}
        {formatSessionDateTime(session.booking_closes_at)}
      </div>
    </Link>
  );
}
