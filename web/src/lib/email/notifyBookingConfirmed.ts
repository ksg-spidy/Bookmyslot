import type { createServiceClient } from "@/lib/supabase/admin";
import {
  buildBookingConfirmationEmailStatusLine,
  sessionCalendarUrl,
  sessionPageUrl,
} from "@/lib/copy/bookingCopy";
import { formatSessionRange } from "@/lib/datetime";
import { sendBookingEmail } from "@/lib/email/sendBookingEmail";

type Admin = ReturnType<typeof createServiceClient>;

export async function notifyBookingConfirmedByEmail(opts: {
  admin: Admin;
  userId: string;
  playSessionId: string;
  status: "confirmed" | "waitlist";
  waitlistPosition: number | null;
}): Promise<void> {
  const { admin, userId, playSessionId, status, waitlistPosition } = opts;

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email?.trim();
  if (authErr || !email) {
    if (authErr) console.error("getUserById for booking email", authErr);
    return;
  }

  const { data: session, error: sErr } = await admin
    .from("play_sessions")
    .select("title, venue, starts_at, ends_at")
    .eq("id", playSessionId)
    .single();

  if (sErr || !session) {
    console.error("play_sessions for booking email", sErr);
    return;
  }

  const title = (session.title as string) ?? "Session";
  const venue = (session.venue as string) ?? "";
  const when = formatSessionRange(session.starts_at as string, session.ends_at as string);
  const sessionUrl = sessionPageUrl(playSessionId);
  const calendarUrl = sessionCalendarUrl(playSessionId);

  const statusLine = buildBookingConfirmationEmailStatusLine(status, waitlistPosition);

  const text = [
    "Thanks for your payment — your ShuttleBook booking is saved.",
    "",
    statusLine,
    "",
    `${title}`,
    venue,
    when,
    "",
    sessionUrl ? `View booking: ${sessionUrl}` : "",
    calendarUrl ? `Add to calendar: ${calendarUrl}` : "",
    "",
    "— ShuttleBook",
  ]
    .filter(Boolean)
    .join("\n");

  const subject =
    status === "confirmed"
      ? `ShuttleBook: confirmed for ${title}`
      : `ShuttleBook: waitlisted for ${title}`;

  const sent = await sendBookingEmail({ to: email, subject, text });
  if (!sent.ok && sent.error !== "email_not_configured") {
    console.error("Booking confirmation email failed", sent.error);
  }
}
