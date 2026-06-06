import { AdminSessionForm } from "@/app/admin/(protected)/AdminSessionForm";
import { CopyPlayerLinkButton } from "@/app/admin/(protected)/CopyPlayerLinkButton";
import { lockPlaySessionForm, unlockPlaySessionForm } from "@/app/actions/sessions";
import { getBookingTimezoneLabel } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AdminHomePage() {
  const supabase = await createClient();
  const { data: sessions, error } = await supabase
    .from("play_sessions")
    .select(
      "id, title, venue, starts_at, booking_closes_at, max_players, booking_code_count, players_per_booking_code, waitlist_per_booking_code, status, booking_fee_cents"
    )
    .order("starts_at", { ascending: false });

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold text-white">Sessions</h1>
        <p className="mt-1 text-sm text-[#8b949e]">Create a slot, then share the player link after sign-in.</p>

        {error ? (
          <p className="mt-4 text-sm text-red-400">{error.message}</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-[#30363d]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#30363d] bg-[#161b22] text-[#8b949e]">
                <tr>
                  <th className="p-3">Title</th>
                  <th className="p-3">Starts</th>
                  <th className="p-3">Capacity</th>
                  <th className="p-3">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {sessions?.map((s) => (
                  <tr key={s.id} className="border-b border-[#21262d]">
                    <td className="p-3 text-white">{s.title}</td>
                    <td className="p-3 text-[#8b949e]">{new Date(s.starts_at).toLocaleString()}</td>
                    <td className="p-3 text-[#8b949e]">
                      {s.booking_code_count ?? 1} code{(s.booking_code_count ?? 1) === 1 ? "" : "s"} ·{" "}
                      {s.max_players} players ·{" "}
                      {(s.booking_code_count ?? 1) * (s.waitlist_per_booking_code ?? 3)} waitlist
                    </td>
                    <td className="p-3 capitalize text-[#8b949e]">{s.status}</td>
                    <td className="p-3 space-y-1">
                      <Link href={`/admin/sessions/${s.id}`} className="text-[#58a6ff] hover:underline">
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
                          <button type="submit" className="text-xs text-[#3fb950] hover:underline">
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
              <p className="p-4 text-sm text-[#8b949e]">No sessions yet — create one below.</p>
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
