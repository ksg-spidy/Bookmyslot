import { syncBookingAfterPayment } from "@/app/actions/syncBooking";
import { AddToCalendarLink } from "@/components/AddToCalendarLink";
import { ProfileIncompleteBanner } from "@/components/ProfileIncompleteBanner";
import { SessionDetailBody } from "@/components/SessionDetailBody";
import { YourBooking } from "@/app/sessions/[id]/YourBooking";
import { getActiveBookingForUser } from "@/lib/bookings/queries";
import { getSessionBookingCounts } from "@/lib/bookings/counts";
import { getProfile } from "@/lib/auth";
import { isProfileComplete } from "@/lib/profile";
import { createServiceClient } from "@/lib/supabase/admin";
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

  const admin = createServiceClient();
  const counts = await getSessionBookingCounts(admin, id, session.max_players as number);

  let booking = await getActiveBookingForUser(supabase, id, user.id);

  if (sp.paid === "1" && !booking && sp.session_id?.trim()) {
    await syncBookingAfterPayment(id, sp.session_id);
    booking = await getActiveBookingForUser(supabase, id, user.id);
  }

  const profile = await getProfile();
  const profileComplete = isProfileComplete(profile);

  const now = new Date();
  const deadline = new Date(session.booking_closes_at);
  const open = session.status === "open" && deadline > now;
  const sessionStarted = new Date(session.starts_at) <= now;
  const canWithdraw =
    Boolean(booking) &&
    open &&
    !sessionStarted &&
    (booking?.status === "confirmed" || booking?.status === "waitlist");

  return (
    <div>
      <Link href="/sessions" className="text-sm text-[#58a6ff] hover:underline">
        ← All sessions
      </Link>

      <SessionDetailBody session={session} counts={counts} />

      {!profileComplete && open && !booking ? <ProfileIncompleteBanner /> : null}

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-white">Your booking</h2>
          {booking &&
          (booking.status === "confirmed" || booking.status === "waitlist") ? (
            <AddToCalendarLink sessionId={id} />
          ) : null}
        </div>
        <YourBooking
          sessionId={id}
          open={open}
          booking={booking}
          justPaid={sp.paid === "1"}
          stripeCheckoutSessionId={sp.session_id}
          profileComplete={profileComplete}
          bookingFeeCents={session.booking_fee_cents as number}
          withdrawalFeeCents={session.withdrawal_fee_cents as number}
          canWithdraw={canWithdraw}
        />
      </div>
    </div>
  );
}
