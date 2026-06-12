import { AdminSessionForm } from "@/app/admin/(protected)/AdminSessionForm";
import { CopyPlayerLinkButton } from "@/app/admin/(protected)/CopyPlayerLinkButton";
import { lockPlaySessionForm, unlockPlaySessionForm } from "@/app/actions/sessions";
import { getBookingTimezoneLabel } from "@/lib/datetime";
import { formatAud } from "@/lib/money";
import { getMoneySummariesForSessions } from "@/lib/payments/ledger";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

type NeedsAttention = {
  stuckWithdrawing: { bookingId: string; sessionTitle: string; updatedAt: string }[];
  unclosedSessions: { id: string; title: string; startsAt: string; waitlistCount: number }[];
  failedNotifications: {
    id: string;
    channel: string;
    kind: string;
    recipient: string | null;
    error: string | null;
    createdAt: string;
  }[];
};

async function getNeedsAttention(
  admin: ReturnType<typeof createServiceClient>
): Promise<NeedsAttention> {
  const nowIso = new Date().toISOString();

  const [{ data: stuck }, { data: pastUnclosed }, { data: failedNotifs }] = await Promise.all([
    admin
      .from("bookings")
      .select("id, updated_at, play_sessions ( title )")
      .eq("status", "withdrawing")
      .order("updated_at", { ascending: true }),
    admin
      .from("play_sessions")
      .select("id, title, starts_at")
      .lte("starts_at", nowIso)
      .is("closed_out_at", null),
    admin
      .from("notification_failures")
      .select("id, channel, kind, recipient, error, created_at")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const pastIds = (pastUnclosed ?? []).map((s) => s.id as string);
  const waitlistCounts = new Map<string, number>();
  if (pastIds.length) {
    const { data: leftovers } = await admin
      .from("bookings")
      .select("play_session_id")
      .in("play_session_id", pastIds)
      .eq("status", "waitlist");
    for (const row of leftovers ?? []) {
      const id = row.play_session_id as string;
      waitlistCounts.set(id, (waitlistCounts.get(id) ?? 0) + 1);
    }
  }

  return {
    stuckWithdrawing: (stuck ?? []).map((b) => {
      const session = b.play_sessions as { title: string } | { title: string }[] | null;
      const title = Array.isArray(session) ? session[0]?.title : session?.title;
      return {
        bookingId: b.id as string,
        sessionTitle: title ?? "Unknown session",
        updatedAt: b.updated_at as string,
      };
    }),
    unclosedSessions: (pastUnclosed ?? [])
      .filter((s) => (waitlistCounts.get(s.id as string) ?? 0) > 0)
      .map((s) => ({
        id: s.id as string,
        title: s.title as string,
        startsAt: s.starts_at as string,
        waitlistCount: waitlistCounts.get(s.id as string) ?? 0,
      })),
    failedNotifications: (failedNotifs ?? []).map((f) => ({
      id: f.id as string,
      channel: f.channel as string,
      kind: f.kind as string,
      recipient: f.recipient as string | null,
      error: f.error as string | null,
      createdAt: f.created_at as string,
    })),
  };
}

export default async function AdminHomePage() {
  const supabase = await createClient();
  const admin = createServiceClient();
  const { data: sessions, error } = await supabase
    .from("play_sessions")
    .select("id, title, venue, starts_at, booking_closes_at, max_players, status, booking_fee_cents")
    .order("starts_at", { ascending: false });

  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  const [moneyBySession, attention] = await Promise.all([
    getMoneySummariesForSessions(admin, sessionIds),
    getNeedsAttention(admin),
  ]);

  const totals = { collected: 0, refunded: 0, feesRetained: 0, netHeld: 0 };
  for (const summary of moneyBySession.values()) {
    totals.collected += summary.collectedCents;
    totals.refunded += summary.refundedCents;
    totals.feesRetained += summary.feesRetainedCents;
    totals.netHeld += summary.netHeldCents;
  }

  const hasAttentionItems =
    attention.stuckWithdrawing.length > 0 ||
    attention.unclosedSessions.length > 0 ||
    attention.failedNotifications.length > 0;

  return (
    <div className="space-y-10">
      {hasAttentionItems ? (
        <section className="rounded-lg border border-warn/50 bg-card p-4">
          <h2 className="text-lg font-medium text-warn">Needs attention</h2>
          {attention.stuckWithdrawing.length > 0 ? (
            <div className="mt-3">
              <p className="text-sm text-white">
                Bookings stuck mid-withdrawal (refund may have been issued but the booking was not
                finalized):
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {attention.stuckWithdrawing.map((b) => (
                  <li key={b.bookingId}>
                    {b.sessionTitle} — booking <code className="text-xs">{b.bookingId.slice(0, 8)}</code>,
                    since {new Date(b.updatedAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {attention.unclosedSessions.length > 0 ? (
            <div className="mt-3">
              <p className="text-sm text-white">
                Past sessions with paid waitlist players still waiting on a refund:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {attention.unclosedSessions.map((s) => (
                  <li key={s.id}>
                    <Link href={`/admin/sessions/${s.id}`} className="text-link hover:underline">
                      {s.title}
                    </Link>{" "}
                    — started {new Date(s.startsAt).toLocaleString()}, {s.waitlistCount} waitlisted.
                    Use “Close out session” to refund them.
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {attention.failedNotifications.length > 0 ? (
            <div className="mt-3">
              <p className="text-sm text-white">
                Failed player notifications (the player may not know their booking changed):
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {attention.failedNotifications.map((f) => (
                  <li key={f.id}>
                    [{f.channel}] {f.kind} to {f.recipient ?? "unknown"} —{" "}
                    {new Date(f.createdAt).toLocaleString()}
                    {f.error ? ` (${f.error.slice(0, 120)})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section>
        <h1 className="text-2xl font-semibold text-white">Sessions</h1>
        <p className="mt-1 text-sm text-muted">Create a slot, then share the player link after sign-in.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Collected (all sessions)", value: totals.collected },
            { label: "Refunded", value: totals.refunded },
            { label: "Fees retained", value: totals.feesRetained },
            { label: "Net held", value: totals.netHeld },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-edge bg-card p-3">
              <p className="text-xs text-muted">{stat.label}</p>
              <p className="mt-1 text-lg font-semibold text-white">{formatAud(stat.value)}</p>
            </div>
          ))}
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-400">{error.message}</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-edge">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-edge bg-card text-muted">
                <tr>
                  <th className="p-3">Title</th>
                  <th className="p-3">Starts</th>
                  <th className="p-3">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {sessions?.map((s) => (
                  <tr key={s.id} className="border-b border-edge-soft">
                    <td className="p-3 text-white">{s.title}</td>
                    <td className="p-3 text-muted">{new Date(s.starts_at).toLocaleString()}</td>
                    <td className="p-3 capitalize text-muted">{s.status}</td>
                    <td className="p-3 space-y-1">
                      <Link href={`/admin/sessions/${s.id}`} className="text-link hover:underline">
                        Bookings
                      </Link>
                      <div>
                        <CopyPlayerLinkButton sessionId={s.id} />
                      </div>
                      {s.status === "open" ? (
                        <form className="inline-block" action={lockPlaySessionForm}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className="text-xs text-red-400 hover:underline">
                            Lock slot
                          </button>
                        </form>
                      ) : null}
                      {s.status === "locked" ? (
                        <form className="inline-block" action={unlockPlaySessionForm}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className="text-xs text-success hover:underline">
                            Unlock slot
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!sessions?.length ? (
              <p className="p-4 text-sm text-muted">No sessions yet — create one below.</p>
            ) : null}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium text-white">New session</h2>
        <AdminSessionForm timezoneLabel={getBookingTimezoneLabel()} />
      </section>
    </div>
  );
}
