import { SessionDetailBody } from "@/components/SessionDetailBody";
import { getSessionBookingCounts } from "@/lib/bookings/counts";
import { getBrowseGuestCtaLabel, getCheckoutButtonLabel } from "@/lib/copy/bookingCopy";
import { createServiceClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const admin = createServiceClient();
  const { data } = await admin.from("play_sessions").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Session" };
}

export default async function BrowseSessionPage({ params }: Props) {
  const { id } = await params;
  const admin = createServiceClient();
  const { data: session, error } = await admin.from("play_sessions").select("*").eq("id", id).single();

  if (error || !session) notFound();

  const counts = await getSessionBookingCounts(admin, id, session.max_players as number);
  const user = await getSessionUser();
  const now = new Date();
  const bookingOpen =
    session.status === "open" && new Date(session.booking_closes_at as string) > now;
  const bookLabel = getCheckoutButtonLabel({
    spotsRemaining: counts.spotsRemaining,
    bookingFeeCents: session.booking_fee_cents as number,
  });

  return (
    <div>
      <Link href="/browse" className="text-sm text-link hover:underline">
        ← All sessions
      </Link>

      <SessionDetailBody session={session} counts={counts} />

      <div className="mt-8 border-t border-edge pt-6">
        {user ? (
          <Link
            href={`/sessions/${id}`}
            className="inline-block rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover"
          >
            {bookLabel}
          </Link>
        ) : bookingOpen ? (
          <div className="space-y-2">
            <Link
              href={`/login?next=${encodeURIComponent(`/sessions/${id}`)}`}
              className="inline-block rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover"
            >
              {getBrowseGuestCtaLabel({
                spotsRemaining: counts.spotsRemaining,
                bookingFeeCents: session.booking_fee_cents as number,
              })}
            </Link>
            <p className="text-xs text-muted">Magic-link sign-in — no password.</p>
          </div>
        ) : (
          <p className="text-sm text-muted">Booking is closed for this session.</p>
        )}
      </div>
    </div>
  );
}
