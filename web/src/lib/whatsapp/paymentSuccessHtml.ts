import { formatWaitlistPosition } from "@/lib/copy/bookingCopy";

export function renderPaymentSuccessHtml(opts: {
  ok: boolean;
  message: string;
  title?: string;
  venue?: string;
  when?: string;
  status?: "confirmed" | "waitlist";
  waitlistPosition?: number | null;
  calendarUrl?: string;
}): string {
  const color = opts.ok ? "#3fb950" : "#f85149";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  const waPhone = process.env.WHATSAPP_PHONE_NUMBER?.replace(/\D/g, "");
  const waLink = waPhone ? `https://wa.me/${waPhone}` : null;

  const details =
    opts.ok && opts.title
      ? `<p class="detail"><strong>${escapeHtml(opts.title)}</strong><br/>${escapeHtml(opts.venue ?? "")}<br/>${escapeHtml(opts.when ?? "")}</p>
         <p class="detail">${escapeHtml(
           opts.status === "waitlist"
             ? formatWaitlistPosition(opts.waitlistPosition) ?? "Waitlisted"
             : "Confirmed"
         )}</p>`
      : "";

  const calendar =
    opts.ok && opts.calendarUrl
      ? `<p><a href="${escapeHtml(opts.calendarUrl)}">Add to calendar (.ics)</a></p>`
      : "";

  const waReturn = waLink
    ? `<p><a href="${escapeHtml(waLink)}">Return to WhatsApp</a></p>`
    : `<p class="muted">Return to WhatsApp for your confirmation message.</p>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>ShuttleBook</title>
<style>
body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;padding:2rem;max-width:28rem;margin:auto}
p.main{color:${color};font-size:1.05rem}
.detail{color:#8b949e;font-size:0.9rem;margin-top:1rem}
a{color:#58a6ff}
.muted{color:#8b949e;font-size:0.85rem}
</style></head><body>
<p class="main">${escapeHtml(opts.message)}</p>
${details}
${calendar}
${opts.ok ? waReturn : ""}
</body></html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
