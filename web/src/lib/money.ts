/** Format integer cents as AUD for display (e.g. 1500 → "$15.00"). */
export function formatAud(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Parse a dollar string from a form field to integer cents. */
export function audInputToCents(value: string): number | null {
  const trimmed = value.trim().replace(/^\$/, "");
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
