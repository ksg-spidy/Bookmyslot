import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function AdminSessionBookingsPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createServiceClient();

  const { data: session, error: se } = await supabase.from("play_sessions").select("*").eq("id", id).single();
  if (se || !session) notFound();

  const { data: bookings, error: be } = await admin
    .from("bookings")
    .select("id, status, waitlist_position, created_at, user_id")
    .eq("play_session_id", id)
    .order("created_at", { ascending: true });

  const userIds = [...new Set((bookings ?? []).map((b) => b.user_id).filter(Boolean))] as string[];
  const { data: profiles } =
    userIds.length > 0
      ? await admin.from("profiles").select("id, full_name, phone").in("id", userIds)
      : { data: [] as { id: string; full_name: string | null; phone: string | null }[] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows =
    bookings?.map((b) => {
      const p = b.user_id ? profileMap.get(b.user_id) : undefined;
      return {
        ...b,
        full_name: p?.full_name ?? "—",
        phone: p?.phone ?? "—",
      };
    }) ?? [];

  return (
    <div>
      <Link href="/admin" className="text-sm text-[#58a6ff] hover:underline">
        ← Admin
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-white">{session.title}</h1>
      <p className="text-sm text-[#8b949e]">{session.venue}</p>
      <p className="mt-2">
        <a
          href={`/api/admin/sessions/${id}/export`}
          className="text-sm text-[#58a6ff] hover:underline"
        >
          Export CSV
        </a>
      </p>

      {be ? (
        <p className="mt-4 text-red-400">{be.message}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-[#30363d]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#30363d] bg-[#161b22] text-[#8b949e]">
              <tr>
                <th className="p-3">Player</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Status</th>
                <th className="p-3">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-b border-[#21262d]">
                  <td className="p-3 text-white">{b.full_name}</td>
                  <td className="p-3 text-[#8b949e]">{b.phone}</td>
                  <td className="p-3 capitalize text-[#8b949e]">
                    {b.status}
                    {b.status === "waitlist" && b.waitlist_position != null ? ` #${b.waitlist_position}` : ""}
                  </td>
                  <td className="p-3 text-[#8b949e]">{new Date(b.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <p className="p-4 text-[#8b949e]">No bookings yet.</p> : null}
        </div>
      )}
    </div>
  );
}
