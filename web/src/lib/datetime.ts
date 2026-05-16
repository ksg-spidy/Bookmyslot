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
