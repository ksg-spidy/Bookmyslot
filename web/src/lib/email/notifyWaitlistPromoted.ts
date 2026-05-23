import type { createServiceClient } from "@/lib/supabase/admin";
import { formatSessionRange } from "@/lib/datetime";
import { sendBookingEmail } from "@/lib/email/sendBookingEmail";

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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  const sessionUrl = siteUrl ? `${siteUrl}/sessions/${playSessionId}` : "";

  const text = [
    "Good news — a spot opened up and you are now confirmed for your badminton session.",
    "",
    `${title}`,
    venue,
    when,
    "",
    sessionUrl ? `View your booking: ${sessionUrl}` : "",
    "",
    "See you on court!",
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
    console.error("Waitlist promotion email failed", sent.error);
  }
}
