import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatSessionDateTime,
  formatSessionRange,
  getBookingTimeZone,
  localDatetimeToIsoUtc,
} from "./datetime";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getBookingTimeZone", () => {
  it("defaults to Australia/Sydney", () => {
    vi.stubEnv("NEXT_PUBLIC_BOOKING_TIMEZONE", "");
    expect(getBookingTimeZone()).toBe("Australia/Sydney");
  });
});

describe("formatSessionDateTime across Sydney DST boundaries", () => {
  // Sydney DST ends on the first Sunday of April (3am AEDT -> 2am AEST)
  // and starts on the first Sunday of October (2am AEST -> 3am AEDT).
  // The same UTC wall time must render an hour apart across each boundary.

  it("renders AEDT (UTC+11) on the Saturday before DST ends in April 2026", () => {
    vi.stubEnv("NEXT_PUBLIC_BOOKING_TIMEZONE", "Australia/Sydney");
    // 2026-04-04T08:00Z = 7:00 pm Sat 4 Apr AEDT
    expect(formatSessionDateTime("2026-04-04T08:00:00Z")).toMatch(/7:00\s*pm/i);
  });

  it("renders AEST (UTC+10) on the Sunday after DST ends in April 2026", () => {
    vi.stubEnv("NEXT_PUBLIC_BOOKING_TIMEZONE", "Australia/Sydney");
    // 2026-04-05T08:00Z = 6:00 pm Sun 5 Apr AEST
    expect(formatSessionDateTime("2026-04-05T08:00:00Z")).toMatch(/6:00\s*pm/i);
  });

  it("renders AEST (UTC+10) on the Saturday before DST starts in October 2026", () => {
    vi.stubEnv("NEXT_PUBLIC_BOOKING_TIMEZONE", "Australia/Sydney");
    // 2026-10-03T08:00Z = 6:00 pm Sat 3 Oct AEST
    expect(formatSessionDateTime("2026-10-03T08:00:00Z")).toMatch(/6:00\s*pm/i);
  });

  it("renders AEDT (UTC+11) on the Sunday after DST starts in October 2026", () => {
    vi.stubEnv("NEXT_PUBLIC_BOOKING_TIMEZONE", "Australia/Sydney");
    // 2026-10-04T08:00Z = 7:00 pm Sun 4 Oct AEDT
    expect(formatSessionDateTime("2026-10-04T08:00:00Z")).toMatch(/7:00\s*pm/i);
  });
});

describe("formatSessionRange", () => {
  it("collapses same-day ranges to a single date", () => {
    vi.stubEnv("NEXT_PUBLIC_BOOKING_TIMEZONE", "Australia/Sydney");
    const range = formatSessionRange("2026-10-04T08:00:00Z", "2026-10-04T10:00:00Z");
    expect(range).toMatch(/7:00\s*pm/i);
    expect(range).toMatch(/9:00\s*pm/i);
    // Date should appear once (start side), not twice.
    expect(range.match(/Oct/g)?.length).toBe(1);
  });
});

describe("localDatetimeToIsoUtc", () => {
  it("converts AEST input (+10:00) to UTC", () => {
    vi.stubEnv("BOOKING_TZ_OFFSET", "+10:00");
    expect(localDatetimeToIsoUtc("2026-06-15T18:00")).toBe("2026-06-15T08:00:00.000Z");
  });

  it("converts AEDT input (+11:00) to UTC", () => {
    vi.stubEnv("BOOKING_TZ_OFFSET", "+11:00");
    expect(localDatetimeToIsoUtc("2026-01-15T18:00")).toBe("2026-01-15T07:00:00.000Z");
  });

  it("normalises shorthand offsets like +10", () => {
    vi.stubEnv("BOOKING_TZ_OFFSET", "+10");
    expect(localDatetimeToIsoUtc("2026-06-15T18:00")).toBe("2026-06-15T08:00:00.000Z");
  });

  it("passes already-zoned input through as the same instant", () => {
    vi.stubEnv("BOOKING_TZ_OFFSET", "+10:00");
    expect(localDatetimeToIsoUtc("2026-06-15T18:00:00Z")).toBe("2026-06-15T18:00:00.000Z");
  });

  it("returns empty input unchanged", () => {
    expect(localDatetimeToIsoUtc("")).toBe("");
  });
});
