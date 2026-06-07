import { AdminSyncBookingForm } from "@/app/admin/(protected)/sessions/[id]/AdminSyncBookingForm";
import { AdminWithdrawBookingButton } from "@/app/admin/(protected)/sessions/[id]/AdminWithdrawBookingButton";
import { formatSessionDateTime } from "@/lib/datetime";
import { formatAud } from "@/lib/money";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

type BookingRow = {
  id: string;
  status: string;
  waitlist_position: number | null;
  created_at: string;
  updated_at: string | null;
  user_id: string | null;
  whatsapp_identity_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

type WhatsappIdentityRow = {
  id: string;
  wa_id: string;
  display_name: string | null;
};

type RegisterRow = BookingRow & {
  playerName: string;
  phone: string;
  source: "Web" | "WhatsApp";
  paymentLabel: string;
  shortCheckoutRef: string;
  shortPaymentRef: string;
};

function badgeClass(status: string): string {
  if (status === "confirmed") return "border-green-900 bg-green-950/40 text-green-300";
  if (status === "waitlist") return "border-yellow-900 bg-yellow-950/40 text-yellow-300";
  if (status === "withdrawn") return "border-[#30363d] bg-[#21262d] text-[#8b949e]";
  return "border-blue-900 bg-blue-950/40 text-blue-300";
}

function shortRef(value: string | null): string {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function paymentLabel(row: BookingRow): string {
  if (row.status === "withdrawn" && row.stripe_payment_intent_id) return "Refunded";
  if (row.stripe_payment_intent_id) return "Paid";
  if (row.stripe_checkout_session_id) return "Checkout started";
  if (row.status === "pending_payment") return "Pending";
  return "No payment ref";
}

function canAdminWithdraw(row: RegisterRow): boolean {
  return row.status === "confirmed" || row.status === "waitlist";
}

export default async function AdminSessionBookingsPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createServiceClient();

  const { data: session, error: se } = await supabase.from("play_sessions").select("*").eq("id", id).single();
  if (se || !session) notFound();

  const { data: bookings, error: be } = await admin
    .from("bookings")
    .select(
      "id, status, waitlist_position, created_at, updated_at, user_id, whatsapp_identity_id, stripe_checkout_session_id, stripe_payment_intent_id"
    )
    .eq("play_session_id", id)
    .order("created_at", { ascending: true });

  const bookingRows = (bookings ?? []) as BookingRow[];
  const userIds = [...new Set(bookingRows.map((b) => b.user_id).filter(Boolean))] as string[];
  const whatsappIdentityIds = [
    ...new Set(bookingRows.map((b) => b.whatsapp_identity_id).filter(Boolean)),
  ] as string[];
  const { data: profiles } =
    userIds.length > 0
      ? await admin.from("profiles").select("id, full_name, phone").in("id", userIds)
      : { data: [] as { id: string; full_name: string | null; phone: string | null }[] };
  const { data: whatsappIdentities } =
    whatsappIdentityIds.length > 0
      ? await admin
          .from("whatsapp_identities")
          .select("id, wa_id, display_name")
          .in("id", whatsappIdentityIds)
      : { data: [] as WhatsappIdentityRow[] };

  const profileMap = new Map(((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]));
  const whatsappMap = new Map(
    ((whatsappIdentities ?? []) as WhatsappIdentityRow[]).map((w) => [w.id, w])
  );

  const rows: RegisterRow[] = bookingRows.map((b) => {
    const p = b.user_id ? profileMap.get(b.user_id) : undefined;
    const w = b.whatsapp_identity_id ? whatsappMap.get(b.whatsapp_identity_id) : undefined;
    return {
      ...b,
      playerName: p?.full_name ?? w?.display_name ?? "Unknown player",
      phone: p?.phone ?? w?.wa_id ?? "—",
      source: b.user_id ? "Web" : "WhatsApp",
      paymentLabel: paymentLabel(b),
      shortCheckoutRef: shortRef(b.stripe_checkout_session_id),
      shortPaymentRef: shortRef(b.stripe_payment_intent_id),
    };
  });

  const counts = rows.reduce(
    (acc, row) => {
      if (row.status === "confirmed") acc.confirmed += 1;
      if (row.status === "waitlist") acc.waitlist += 1;
      if (row.status === "withdrawn") acc.withdrawn += 1;
      if (row.status === "pending_payment") acc.pending += 1;
      return acc;
    },
    { confirmed: 0, waitlist: 0, withdrawn: 0, pending: 0 }
  );

  return (
    <div>
      <Link href="/admin" className="text-sm text-[#58a6ff] hover:underline">
        ← Admin
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-white">{session.title}</h1>
      <p className="text-sm text-[#8b949e]">{session.venue}</p>
      <p className="mt-1 text-sm text-[#8b949e]">
        {session.booking_code_count ?? 1} booking code{(session.booking_code_count ?? 1) === 1 ? "" : "s"} ·{" "}
        {session.max_players} confirmed capacity ·{" "}
        {(session.booking_code_count ?? 1) * (session.waitlist_per_booking_code ?? 3)} waitlist capacity
      </p>
      <p className="mt-2">
        <a
          href={`/api/admin/sessions/${id}/export`}
          className="text-sm text-[#58a6ff] hover:underline"
        >
          Export CSV
        </a>
      </p>

      <AdminSyncBookingForm playSessionId={id} />

      {be ? (
        <p className="mt-4 text-red-400">{be.message}</p>
      ) : (
        <section className="mt-6 rounded-xl border border-[#30363d] bg-[#0d1117]">
          <div className="border-b border-[#30363d] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Booking register</h2>
                <p className="mt-1 text-sm text-[#8b949e]">
                  Full session roster, payment references, source, and admin withdrawal actions.
                </p>
              </div>
              <div className="text-sm text-[#8b949e]">
                Fee <span className="text-white">{formatAud(session.booking_fee_cents)}</span>, withdraw
                fee <span className="text-white">{formatAud(session.withdrawal_fee_cents)}</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-green-900/70 bg-green-950/20 p-3">
                <p className="text-xs uppercase tracking-wide text-[#8b949e]">Confirmed</p>
                <p className="mt-1 text-xl font-semibold text-white">{counts.confirmed}</p>
              </div>
              <div className="rounded-lg border border-yellow-900/70 bg-yellow-950/20 p-3">
                <p className="text-xs uppercase tracking-wide text-[#8b949e]">Waitlist</p>
                <p className="mt-1 text-xl font-semibold text-white">{counts.waitlist}</p>
              </div>
              <div className="rounded-lg border border-blue-900/70 bg-blue-950/20 p-3">
                <p className="text-xs uppercase tracking-wide text-[#8b949e]">Pending</p>
                <p className="mt-1 text-xl font-semibold text-white">{counts.pending}</p>
              </div>
              <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3">
                <p className="text-xs uppercase tracking-wide text-[#8b949e]">Withdrawn</p>
                <p className="mt-1 text-xl font-semibold text-white">{counts.withdrawn}</p>
              </div>
            </div>
          </div>

          {!rows.length ? (
            <p className="p-4 text-sm text-[#8b949e]">No bookings yet.</p>
          ) : (
            <>
              <div className="divide-y divide-[#21262d] md:hidden">
                {rows.map((b, index) => (
                  <article key={b.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#8b949e]">#{index + 1}</p>
                        <h3 className="font-medium text-white">{b.playerName}</h3>
                        <p className="text-sm text-[#8b949e]">{b.phone}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-xs capitalize ${badgeClass(b.status)}`}>
                        {b.status}
                        {b.status === "waitlist" && b.waitlist_position != null ? ` #${b.waitlist_position}` : ""}
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-[#8b949e]">Source</dt>
                        <dd className="mt-1 text-white">{b.source}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-[#8b949e]">Payment</dt>
                        <dd className="mt-1 text-white">{b.paymentLabel}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs uppercase tracking-wide text-[#8b949e]">Booked</dt>
                        <dd className="mt-1 text-white">{formatSessionDateTime(b.created_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-[#8b949e]">Checkout</dt>
                        <dd className="mt-1 text-white">{b.shortCheckoutRef}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-[#8b949e]">Payment ref</dt>
                        <dd className="mt-1 text-white">{b.shortPaymentRef}</dd>
                      </div>
                    </dl>
                    {canAdminWithdraw(b) ? (
                      <AdminWithdrawBookingButton
                        playSessionId={id}
                        bookingId={b.id}
                        playerName={b.playerName}
                        bookingFeeCents={session.booking_fee_cents}
                        withdrawalFeeCents={session.withdrawal_fee_cents}
                      />
                    ) : (
                      <p className="text-xs text-[#8b949e]">No active withdrawal action.</p>
                    )}
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#30363d] bg-[#161b22] text-[#8b949e]">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Player</th>
                      <th className="p-3">Contact</th>
                      <th className="p-3">Source</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Payment</th>
                      <th className="p-3">Booked</th>
                      <th className="p-3">Refs</th>
                      <th className="p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((b, index) => (
                      <tr key={b.id} className="border-b border-[#21262d] align-top">
                        <td className="p-3 text-[#8b949e]">{index + 1}</td>
                        <td className="p-3 text-white">{b.playerName}</td>
                        <td className="p-3 text-[#8b949e]">{b.phone}</td>
                        <td className="p-3 text-[#8b949e]">{b.source}</td>
                        <td className="p-3">
                          <span className={`rounded-full border px-2 py-1 text-xs capitalize ${badgeClass(b.status)}`}>
                            {b.status}
                            {b.status === "waitlist" && b.waitlist_position != null ? ` #${b.waitlist_position}` : ""}
                          </span>
                        </td>
                        <td className="p-3 text-[#8b949e]">{b.paymentLabel}</td>
                        <td className="p-3 text-[#8b949e]">{formatSessionDateTime(b.created_at)}</td>
                        <td className="p-3 text-xs text-[#8b949e]">
                          <div>Checkout: {b.shortCheckoutRef}</div>
                          <div>Payment: {b.shortPaymentRef}</div>
                        </td>
                        <td className="p-3">
                          {canAdminWithdraw(b) ? (
                            <AdminWithdrawBookingButton
                              playSessionId={id}
                              bookingId={b.id}
                              playerName={b.playerName}
                              bookingFeeCents={session.booking_fee_cents}
                              withdrawalFeeCents={session.withdrawal_fee_cents}
                            />
                          ) : (
                            <span className="text-xs text-[#8b949e]">No action</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
