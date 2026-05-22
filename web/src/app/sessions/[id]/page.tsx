import { syncBookingAfterPayment } from "@/app/actions/syncBooking";
import { YourBooking } from "@/app/sessions/[id]/YourBooking";
import { getActiveBookingForUser } from "@/lib/bookings/queries";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string; canceled?: string; session_id?: string }>;
};

export default async function SessionDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: session, error } = await supabase.from("play_sessions").select("*").eq("id", id).single();

  if (error || !session) notFound();

  let booking = await getActiveBookingForUser(supabase, id, user.id);

  if (sp.paid === "1" && !booking && sp.session_id?.trim()) {
    await syncBookingAfterPayment(id, sp.session_id);
    booking = await getActiveBookingForUser(supabase, id, user.id);
  }

  const now = new Date();
  const deadline = new Date(session.booking_closes_at);
  const open = session.status === "open" && deadline > now;

  return (
    <div>
      <Link href="/sessions" className="text-sm text-[#58a6ff] hover:underline">
        ← All sessions
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-white">{session.title}</h1>
      <p className="mt-2 text-[#8b949e]">{session.venue}</p>
      <p className="mt-1 text-sm text-[#8b949e]">
        {new Date(session.starts_at).toLocaleString()} — {new Date(session.ends_at).toLocaleString()}
      </p>
      <p className="mt-4 text-sm text-white">
        Fee: <strong>{(session.booking_fee_cents / 100).toFixed(2)} AUD</strong> · Withdrawal fee:{" "}
        <strong>{(session.withdrawal_fee_cents / 100).toFixed(2)} AUD</strong>
      </p>
      <p className="mt-1 text-sm text-[#8b949e]">
        Booking closes: {deadline.toLocaleString()} · Max players: {session.max_players}
      </p>

      {sp.paid === "1" && !booking ? (
        <p className="mt-4 rounded-lg border border-[#238636] bg-[#0c2218] p-3 text-sm text-[#3fb950]">
          Payment received — saving your booking now. This page will update in a few seconds.
        </p>
      ) : null}
      {sp.paid === "1" && booking ? (
        <p className="mt-4 rounded-lg border border-[#238636] bg-[#0c2218] p-3 text-sm text-[#3fb950]">
          Payment received — your booking is{" "}
          <strong className="capitalize">{booking.status}</strong>.
        </p>
      ) : null}
      {sp.canceled === "1" ? (
        <p className="mt-4 text-sm text-[#f0c93a]">Checkout canceled — you can try again when ready.</p>
      ) : null}

      <div className="mt-8 border-t border-[#30363d] pt-6">
        <h2 className="text-lg font-medium text-white">Your booking</h2>
        <YourBooking
          sessionId={id}
          open={open}
          booking={booking}
          justPaid={sp.paid === "1"}
          stripeCheckoutSessionId={sp.session_id}
        />
      </div>
    </div>
  );
}
