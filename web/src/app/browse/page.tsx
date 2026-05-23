import { SessionCard } from "@/components/SessionCard";
import { getBookingCountsForSessions } from "@/lib/bookings/counts";
import { fetchOpenPlaySessions } from "@/lib/sessions/openSessions";
import { createServiceClient } from "@/lib/supabase/admin";
import Link from "next/link";

export const metadata = {
  title: "Browse sessions",
};

export default async function BrowsePage() {
  const admin = createServiceClient();
  const { rows, error } = await fetchOpenPlaySessions(admin);

  if (error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
        Could not load sessions. ({error})
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-white">Open sessions</h1>
        <p className="mt-2 text-[#8b949e]">No sessions accepting bookings right now. Check back later.</p>
      </div>
    );
  }

  const countsMap = await getBookingCountsForSessions(admin, rows);

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">Open sessions</h1>
      <p className="mt-1 text-sm text-[#8b949e]">
        View times and availability without signing in.{" "}
        <Link href="/login" className="text-[#58a6ff] hover:underline">
          Sign in
        </Link>{" "}
        to book.
      </p>
      <ul className="mt-6 space-y-3">
        {rows.map((s) => (
          <li key={s.id}>
            <SessionCard
              session={s}
              href={`/browse/${s.id}`}
              counts={countsMap.get(s.id) ?? { confirmed: 0, waitlist: 0, spotsRemaining: s.max_players }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
