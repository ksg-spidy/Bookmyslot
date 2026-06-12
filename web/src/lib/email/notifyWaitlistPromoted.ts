import type { createServiceClient } from "@/lib/supabase/admin";
import { PROMOTION_CONFIRMED_MESSAGE, sessionPageUrl } from "@/lib/copy/bookingCopy";
import { formatSessionRange } from "@/lib/datetime";
import { sendBookingEmail } from "@/lib/email/sendBookingEmail";
import { recordNotificationFailure } from "@/lib/notifications/failures";

type Admin = ReturnType<typeof createServiceClient>;

export async function notifyWaitlistPromotedByEmail(opts: {
  admin: Admin;
  userId: string;
  playSessionId: string;
}): Promise<void> {
  const { admin, userId, playSessionId } = opts;

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email?.trim();
  if (authErr || !email) {
    if (authErr) console.error("getUserById for promotion email", authErr);
    return;
  }

  const { data: session, error: sErr } = await admin
    .from("play_sessions")
    .select("title, venue, starts_at, ends_at")
    .eq("id", playSessionId)
    .single();

  if (sErr || !session) {
    console.error("play_sessions for promotion email", sErr);
    return;
  }

  const title = (session.title as string) ?? "Session";
  const venue = (session.venue as string) ?? "";
  const when = formatSessionRange(session.starts_at as string, session.ends_at as string);
  const sessionUrl = sessionPageUrl(playSessionId);

  const text = [
    PROMOTION_CONFIRMED_MESSAGE,
    "",
    `${title}`,
    venue,
    when,
    "",
    sessionUrl ? `View your booking: ${sessionUrl}` : "",
    "",
    "— ShuttleBook",
  ]
    .filter(Boolean)
    .join("\n");

  const sent = await sendBookingEmail({
    to: email,
    subject: `ShuttleBook: confirmed for ${title}`,
    text,
  });

  if (!sent.ok && sent.error !== "email_not_configured") {
    await recordNotificationFailure(admin, {
      channel: "email",
      kind: "waitlist_promoted",
      recipient: email,
      playSessionId,
      error: sent.error,
    });
  }
}
