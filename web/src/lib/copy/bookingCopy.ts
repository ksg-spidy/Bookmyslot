import { formatAud } from "@/lib/money";

/** Canonical waitlist label, e.g. "Waitlist #3". */
export function formatWaitlistPosition(position: number | null | undefined): string | null {
  if (position == null) return null;
  return `Waitlist #${position}`;
}

/** Status line after payment (web). */
export function paymentSuccessStatusLabel(
  status: string,
  waitlistPosition: number | null | undefined
): string {
  if (status === "waitlist") {
    const wl = formatWaitlistPosition(waitlistPosition);
    return wl ? wl.toLowerCase() : "waitlisted";
  }
  return status;
}

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
}

export function refundPolicyUrl(): string {
  const site = getSiteUrl();
  return site ? `${site}/refund` : "/refund";
}

export function sessionCalendarUrl(playSessionId: string): string {
  const site = getSiteUrl();
  return site ? `${site}/api/calendar/session/${playSessionId}` : "";
}

export function sessionPageUrl(playSessionId: string): string {
  const site = getSiteUrl();
  return site ? `${site}/sessions/${playSessionId}` : "";
}

/** Compact fee for WhatsApp button titles (Meta max 20 chars). */
export function formatAudShort(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

export function getBrowseGuestCtaLabel(opts: {
  spotsRemaining: number;
  bookingFeeCents: number;
}): string {
  const fee = formatAud(opts.bookingFeeCents);
  if (opts.spotsRemaining <= 0) {
    return `Sign in — join waitlist (${fee})`;
  }
  return `Sign in to book — ${fee}`;
}

export function getCheckoutButtonLabel(opts: {
  spotsRemaining: number;
  bookingFeeCents: number;
}): string {
  const fee = formatAud(opts.bookingFeeCents);
  if (opts.spotsRemaining <= 0) {
    return `Join waitlist — pay ${fee}`;
  }
  return `Pay & book — ${fee}`;
}

export function getWaitlistCheckoutHint(waitlistCount: number, bookingFeeCents: number): string {
  const fee = formatAud(bookingFeeCents);
  const queue =
    waitlistCount > 0 ? `${waitlistCount} already on the waitlist. ` : "";
  return `Session is full. ${queue}You pay ${fee} now to join the waitlist. If someone withdraws, the next person is promoted automatically.`;
}

/** WhatsApp CTA button label (max 20 characters). */
export function getWhatsAppPayButtonLabel(full: boolean, bookingFeeCents: number): string {
  const fee = formatAudShort(bookingFeeCents);
  const label = full ? `Waitlist ${fee}` : `Pay ${fee}`;
  return label.slice(0, 20);
}

export function getWhatsAppBookIntro(opts: {
  full: boolean;
  bookingFeeCents: number;
  waitlistCount: number;
}): string {
  const fee = formatAud(opts.bookingFeeCents);
  const refund = refundPolicyUrl();
  if (opts.full) {
    const queue =
      opts.waitlistCount > 0 ? ` (${opts.waitlistCount} on the waitlist)` : "";
    return (
      `Session is full${queue}. You pay ${fee} now to join the waitlist. ` +
      `If someone withdraws, the next person is promoted automatically.\n` +
      `Refund policy: ${refund}\n\n` +
      `Tap below to pay securely.`
    );
  }
  return "Tap the button below to pay securely and confirm your spot.";
}

export const WAITLIST_AFTER_BOOK_MESSAGE =
  "You are on the waitlist. If someone withdraws, the next person is promoted automatically. We will notify you when you are confirmed.";

export const PROMOTION_CONFIRMED_MESSAGE =
  "Good news — a spot opened up. You are now confirmed. See you on court!";

export function withdrawSuccessMessage(refundCents: number, withdrawalFeeCents: number): string {
  const refundDollars = (refundCents / 100).toFixed(2);
  const feeDollars = (withdrawalFeeCents / 100).toFixed(2);
  return `Booking withdrawn. A $${feeDollars} withdrawal fee was kept; $${refundDollars} is refunded to your card.`;
}

export function buildWhatsAppBookingConfirmationBody(opts: {
  title: string;
  venue: string;
  when: string;
  status: "confirmed" | "waitlist";
  waitlistPosition: number | null;
  playSessionId: string;
}): string {
  const { title, venue, when, status, waitlistPosition, playSessionId } = opts;
  const calendar = sessionCalendarUrl(playSessionId);
  const calendarLine = calendar ? `\nAdd to calendar: ${calendar}` : "";

  if (status === "confirmed") {
    return (
      `ShuttleBook: you are confirmed for ${title}.\n${venue}\n${when}\n` +
      `Payment received — see you on court.${calendarLine}`
    );
  }

  const wl = formatWaitlistPosition(waitlistPosition);
  const wlLine = wl ? `${wl}. ` : "";
  return (
    `ShuttleBook: ${wlLine}You are waitlisted for ${title} (${venue}).\n${when}\n` +
    `Payment received — we will notify you in WhatsApp when you are confirmed.${calendarLine}`
  );
}

export function buildBookingConfirmationEmailStatusLine(
  status: "confirmed" | "waitlist",
  waitlistPosition: number | null
): string {
  if (status === "confirmed") {
    return "You are confirmed for this session.";
  }
  const wl = formatWaitlistPosition(waitlistPosition);
  return wl
    ? `${wl}. We will email you when you are confirmed.`
    : "You are on the waitlist. We will email you when you are confirmed.";
}
