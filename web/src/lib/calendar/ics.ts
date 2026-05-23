/** Escape text for iCalendar (RFC 5545). */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function buildSessionIcs(opts: {
  uid: string;
  title: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  siteUrl?: string;
}): string {
  const dtStart = toIcsUtc(opts.startsAt);
  const dtEnd = toIcsUtc(opts.endsAt);
  const dtStamp = toIcsUtc(new Date().toISOString());
  if (!dtStart || !dtEnd) {
    throw new Error("Invalid session times for calendar export");
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ShuttleBook//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(opts.uid)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(opts.title)}`,
    `LOCATION:${escapeIcsText(opts.venue)}`,
  ];

  const descParts = [opts.description, opts.siteUrl ? `Details: ${opts.siteUrl}` : ""].filter(Boolean);
  if (descParts.length) {
    lines.push(`DESCRIPTION:${escapeIcsText(descParts.join("\n"))}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
