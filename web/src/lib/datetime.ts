const DEFAULT_BOOKING_TIMEZONE = "Australia/Sydney";

/** IANA zone for displaying session times (DST-aware). Override with `NEXT_PUBLIC_BOOKING_TIMEZONE`. */
export function getBookingTimeZone(): string {
  return (
    process.env.NEXT_PUBLIC_BOOKING_TIMEZONE?.trim() ||
    process.env.BOOKING_TIMEZONE?.trim() ||
    DEFAULT_BOOKING_TIMEZONE
  );
}

/** Short label shown next to formatted times (e.g. AEST). */
export function getBookingTimezoneLabel(): string {
  const tz = getBookingTimeZone();
  if (tz === "Australia/Sydney" || tz === "Australia/Melbourne") {
    return "AEST/AEDT";
  }
  const offset = (process.env.BOOKING_TZ_OFFSET ?? "+10:00").trim();
  if (offset === "+10:00" || offset === "+10") return "AEST";
  if (offset === "+11:00" || offset === "+11") return "AEDT";
  return offset;
}

export function formatSessionDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: getBookingTimeZone(),
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatSessionTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: getBookingTimeZone(),
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatSessionRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const sameDay =
    start.toLocaleDateString("en-AU", { timeZone: getBookingTimeZone() }) ===
    end.toLocaleDateString("en-AU", { timeZone: getBookingTimeZone() });

  if (sameDay) {
    return `${formatSessionDateTime(startsAt)} – ${formatSessionTime(endsAt)} (${getBookingTimezoneLabel()})`;
  }
  return `${formatSessionDateTime(startsAt)} – ${formatSessionDateTime(endsAt)} (${getBookingTimezoneLabel()})`;
}

/**
 * Converts `<input type="datetime-local" />` values (no timezone) to ISO UTC for Postgres `timestamptz`.
 * Set `BOOKING_TZ_OFFSET` in `.env.local` to your club's offset, e.g. `+10:00` or `+11:00` (AEST/AEDT).
 */
export function localDatetimeToIsoUtc(localInput: string): string {
  const trimmed = localInput.trim();
  if (!trimmed) return trimmed;

  const offset = (process.env.BOOKING_TZ_OFFSET ?? "+10:00").trim();
  const normalizedOff = /^[+-]\d{2}$/.test(offset) ? `${offset}:00` : offset;

  let body = trimmed;
  if (body.includes("Z") || /[+-]\d{2}:?\d{2}$/.test(body)) {
    const d = new Date(body);
    return isNaN(d.getTime()) ? body : d.toISOString();
  }

  if (body.length === 16 && body.includes("T")) {
    body = `${body}:00`;
  }

  const d = new Date(`${body}${normalizedOff}`);
  return isNaN(d.getTime()) ? trimmed : d.toISOString();
}
