import type { createServiceClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/copy/bookingCopy";
import { sendBookingEmail } from "@/lib/email/sendBookingEmail";

type Admin = ReturnType<typeof createServiceClient>;

export async function notifyWithdrawByEmail(opts: {
  admin: Admin;
  userId: string;
  message: string;
  playSessionId: string;
}): Promise<void> {
  const { admin, userId, message, playSessionId } = opts;

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email?.trim();
  if (authErr || !email) {
    if (authErr) console.error("getUserById for withdraw email", authErr);
    return;
  }

  const { data: session } = await admin
    .from("play_sessions")
    .select("title")
    .eq("id", playSessionId)
    .maybeSingle();

  const title = (session?.title as string) ?? "your session";
  const siteUrl = getSiteUrl();
  const sessionUrl = siteUrl ? `${siteUrl}/sessions/bookings` : "";

  const text = [
    `Your ShuttleBook booking for ${title} has been withdrawn.`,
    "",
    message,
    "",
    sessionUrl ? `My bookings: ${sessionUrl}` : "",
    "",
    "— ShuttleBook",
  ]
    .filter(Boolean)
    .join("\n");

  const sent = await sendBookingEmail({
    to: email,
    subject: `ShuttleBook: booking withdrawn — ${title}`,
    text,
  });

  if (!sent.ok && sent.error !== "email_not_configured") {
    console.error("Withdraw email failed", sent.error);
  }
}
