export type SendBookingEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Optional transactional email via Resend.
 * Set RESEND_API_KEY and BOOKING_EMAIL_FROM (e.g. ShuttleBook <onboarding@resend.dev>).
 */
export async function sendBookingEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<SendBookingEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.BOOKING_EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    return { ok: false, error: "email_not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Resend email failed", res.status, body);
      return { ok: false, error: `resend_${res.status}` };
    }

    return { ok: true };
  } catch (e) {
    console.error("Resend email error", e);
    return { ok: false, error: e instanceof Error ? e.message : "send_failed" };
  }
}
