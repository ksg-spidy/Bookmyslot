import { createServiceClient } from "@/lib/supabase/admin";
import Link from "next/link";

const PAID_STATUSES = ["confirmed", "waitlist", "withdrawing", "withdrawn"];

type BookingRow = {
  created_at: string;
  status: string;
  user_id: string | null;
  whatsapp_identity_id: string | null;
  play_session_id: string;
};

function isoWeekLabel(date: Date): string {
  // ISO week: Thursday of the current week determines the year/week number.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export default async function AdminStatsPage() {
  const admin = createServiceClient();

  const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: bookings, error: bErr }, { data: sessions, error: sErr }] = await Promise.all([
    admin
      .from("bookings")
      .select("created_at, status, user_id, whatsapp_identity_id, play_session_id")
      .in("status", PAID_STATUSES)
      .gte("created_at", twelveWeeksAgo),
    admin
      .from("play_sessions")
      .select("id, title, starts_at, max_players")
      .order("starts_at", { ascending: false })
      .limit(20),
  ]);

  if (bErr || sErr) {
    return (
      <p className="text-sm text-red-400">
        Could not load stats: {bErr?.message ?? sErr?.message}
      </p>
    );
  }

  const rows = (bookings ?? []) as BookingRow[];

  // Weekly active bookers: distinct identities (web user or WhatsApp identity)
  // that made a paid booking in each ISO week.
  const bookersByWeek = new Map<string, Set<string>>();
  let webCount = 0;
  let whatsappCount = 0;

  for (const b of rows) {
    const identity = b.user_id ? `u:${b.user_id}` : `w:${b.whatsapp_identity_id}`;
    if (b.user_id) webCount += 1;
    else whatsappCount += 1;

    const week = isoWeekLabel(new Date(b.created_at));
    const set = bookersByWeek.get(week) ?? new Set<string>();
    set.add(identity);
    bookersByWeek.set(week, set);
  }

  const weeks = [...bookersByWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([week, set]) => ({ week, bookers: set.size }));

  const totalBookings = webCount + whatsappCount;

  // Fill rate per session: confirmed bookings vs capacity.
  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  const confirmedBySession = new Map<string, number>();
  if (sessionIds.length) {
    const { data: confirmed } = await admin
      .from("bookings")
      .select("play_session_id")
      .in("play_session_id", sessionIds)
      .eq("status", "confirmed");
    for (const row of confirmed ?? []) {
      const id = row.play_session_id as string;
      confirmedBySession.set(id, (confirmedBySession.get(id) ?? 0) + 1);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin" className="text-sm text-link hover:underline">
          ← Admin
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">Stats</h1>
        <p className="mt-1 text-sm text-muted">
          Paid bookings only (confirmed, waitlisted, or later withdrawn). Last 12 weeks.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium text-white">Channel split</h2>
        {totalBookings === 0 ? (
          <p className="mt-2 text-sm text-muted">No bookings in the last 12 weeks.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-edge bg-card p-3">
              <p className="text-xs text-muted">Website</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {webCount}{" "}
                <span className="text-sm font-normal text-muted">
                  ({Math.round((webCount / totalBookings) * 100)}%)
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-edge bg-card p-3">
              <p className="text-xs text-muted">WhatsApp</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {whatsappCount}{" "}
                <span className="text-sm font-normal text-muted">
                  ({Math.round((whatsappCount / totalBookings) * 100)}%)
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-edge bg-card p-3">
              <p className="text-xs text-muted">Total</p>
              <p className="mt-1 text-lg font-semibold text-white">{totalBookings}</p>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium text-white">Weekly active bookers</h2>
        {weeks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No data yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-edge">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-edge bg-card text-muted">
                <tr>
                  <th className="p-3">Week</th>
                  <th className="p-3">Distinct bookers</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.week} className="border-b border-edge-soft">
                    <td className="p-3 text-white">{w.week}</td>
                    <td className="p-3 text-muted">{w.bookers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium text-white">Fill rate (last 20 sessions)</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-edge">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-edge bg-card text-muted">
              <tr>
                <th className="p-3">Session</th>
                <th className="p-3">Starts</th>
                <th className="p-3">Confirmed</th>
                <th className="p-3">Fill rate</th>
              </tr>
            </thead>
            <tbody>
              {(sessions ?? []).map((s) => {
                const confirmed = confirmedBySession.get(s.id as string) ?? 0;
                const max = (s.max_players as number) || 1;
                const pct = Math.round((confirmed / max) * 100);
                return (
                  <tr key={s.id as string} className="border-b border-edge-soft">
                    <td className="p-3 text-white">
                      <Link
                        href={`/admin/sessions/${s.id}`}
                        className="text-link hover:underline"
                      >
                        {s.title as string}
                      </Link>
                    </td>
                    <td className="p-3 text-muted">
                      {new Date(s.starts_at as string).toLocaleString()}
                    </td>
                    <td className="p-3 text-muted">
                      {confirmed} / {s.max_players as number}
                    </td>
                    <td className="p-3 text-muted">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!(sessions ?? []).length ? (
            <p className="p-4 text-sm text-muted">No sessions yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
