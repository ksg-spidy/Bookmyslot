import { SessionCard } from "@/components/SessionCard";
import { getBookingCountsForSessions } from "@/lib/bookings/counts";
import { fetchOpenPlaySessions } from "@/lib/sessions/openSessions";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function SessionsPage() {
  const supabase = await createClient();
  const { rows, error } = await fetchOpenPlaySessions(supabase);

  if (error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
        Could not load sessions. Did you run the database migration? ({error})
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-white">Open sessions</h1>
        <p className="mt-2 text-[#8b949e]">No sessions accepting bookings right now.</p>
        <Link href="/browse" className="mt-4 inline-block text-sm text-[#58a6ff] hover:underline">
          Public session list
        </Link>
      </div>
    );
  }

  const admin = createServiceClient();
  const countsMap = await getBookingCountsForSessions(admin, rows);

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">Open sessions</h1>
      <p className="mt-1 text-sm text-[#8b949e]">Choose a session to view details and book.</p>
      <ul className="mt-6 space-y-3">
        {rows.map((s) => (
          <li key={s.id}>
            <SessionCard
              session={s}
              href={`/sessions/${s.id}`}
              counts={
                countsMap.get(s.id) ?? {
                  confirmed: 0,
                  waitlist: 0,
                  spotsRemaining: s.max_players,
                  waitlistCapacity: s.booking_code_count * s.waitlist_per_booking_code,
                  waitlistRemaining: s.booking_code_count * s.waitlist_per_booking_code,
                }
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
