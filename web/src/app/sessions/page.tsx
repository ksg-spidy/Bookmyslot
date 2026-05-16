import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function SessionsPage() {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("play_sessions")
    .select("id, title, venue, starts_at, ends_at, booking_closes_at, max_players, status, booking_fee_cents")
    .eq("status", "open")
    .gt("booking_closes_at", now)
    .order("starts_at", { ascending: true });

  if (error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
        Could not load sessions. Did you run the database migration? ({error.message})
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-white">Open sessions</h1>
        <p className="mt-2 text-[#8b949e]">No sessions accepting bookings right now.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">Open sessions</h1>
      <p className="mt-1 text-sm text-[#8b949e]">Sign in required — book after choosing a session.</p>
      <ul className="mt-6 space-y-3">
        {rows.map((s) => (
          <li key={s.id}>
            <Link
              href={`/sessions/${s.id}`}
              className="block rounded-lg border border-[#30363d] bg-[#161b22] p-4 transition hover:border-[#58a6ff]"
            >
              <div className="font-medium text-white">{s.title}</div>
              <div className="mt-1 text-sm text-[#8b949e]">{s.venue}</div>
              <div className="mt-2 text-xs text-[#8b949e]">
                {(s.booking_fee_cents / 100).toFixed(2)} AUD · closes{" "}
                {new Date(s.booking_closes_at).toLocaleString()}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
