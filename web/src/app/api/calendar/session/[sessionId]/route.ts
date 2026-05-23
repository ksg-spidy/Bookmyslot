import { ACTIVE_BOOKING_STATUSES } from "@/lib/bookings/queries";
import { buildSessionIcs } from "@/lib/calendar/ics";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("play_session_id", sessionId)
    .eq("user_id", user.id)
    .in("status", [...ACTIVE_BOOKING_STATUSES])
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ error: "No active booking" }, { status: 404 });
  }

  const { data: session, error: sErr } = await supabase
    .from("play_sessions")
    .select("title, venue, starts_at, ends_at")
    .eq("id", sessionId)
    .single();

  if (sErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  const ics = buildSessionIcs({
    uid: `shuttlebook-booking-${booking.id}@shuttlebook`,
    title: (session.title as string) ?? "Badminton session",
    venue: (session.venue as string) ?? "",
    startsAt: session.starts_at as string,
    endsAt: session.ends_at as string,
    description: `Booking status: ${booking.status}`,
    siteUrl: siteUrl ? `${siteUrl}/sessions/${sessionId}` : undefined,
  });

  const filename = `shuttlebook-${sessionId.slice(0, 8)}.ics`;
  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
