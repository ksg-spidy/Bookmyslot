import { AdminSessionForm } from "@/app/admin/(protected)/AdminSessionForm";
import { lockPlaySessionForm } from "@/app/actions/sessions";
import { getBookingTimezoneLabel } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AdminHomePage() {
  const supabase = await createClient();
  const { data: sessions, error } = await supabase
    .from("play_sessions")
    .select("id, title, venue, starts_at, booking_closes_at, max_players, status, booking_fee_cents")
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
                  <th className="p-3">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {sessions?.map((s) => (
                  <tr key={s.id} className="border-b border-[#21262d]">
                    <td className="p-3 text-white">{s.title}</td>
                    <td className="p-3 text-[#8b949e]">{new Date(s.starts_at).toLocaleString()}</td>
                    <td className="p-3 capitalize text-[#8b949e]">{s.status}</td>
                    <td className="p-3">
                      <Link href={`/admin/sessions/${s.id}`} className="text-[#58a6ff] hover:underline">
                        Bookings
                      </Link>
                      {s.status === "open" ? (
                        <form className="mt-2 inline-block" action={lockPlaySessionForm}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className="text-xs text-red-400 hover:underline">
                            Lock slot
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
