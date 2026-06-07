export const DEFAULT_BOOKING_CODE_COUNT = 1;
export const DEFAULT_PLAYERS_PER_BOOKING_CODE = 6;
export const DEFAULT_WAITLIST_PER_BOOKING_CODE = 3;

export type SessionCapacityConfig = {
  booking_code_count?: number | null;
  players_per_booking_code?: number | null;
  waitlist_per_booking_code?: number | null;
  max_players?: number | null;
};

export type NormalizedSessionCapacity = {
  bookingCodeCount: number;
  playersPerBookingCode: number;
  waitlistPerBookingCode: number;
  maxPlayers: number;
  waitlistCapacity: number;
};

function positiveInt(value: number | null | undefined, fallback: number): number {
  return Number.isInteger(value) && value != null && value > 0 ? value : fallback;
}

function nonNegativeInt(value: number | null | undefined, fallback: number): number {
  return Number.isInteger(value) && value != null && value >= 0 ? value : fallback;
}

export function normalizeSessionCapacity(
  config: SessionCapacityConfig
): NormalizedSessionCapacity {
  const bookingCodeCount = positiveInt(config.booking_code_count, DEFAULT_BOOKING_CODE_COUNT);
  const playersPerBookingCode = positiveInt(
    config.players_per_booking_code,
    positiveInt(config.max_players, DEFAULT_PLAYERS_PER_BOOKING_CODE)
  );
  const waitlistPerBookingCode = nonNegativeInt(
    config.waitlist_per_booking_code,
    DEFAULT_WAITLIST_PER_BOOKING_CODE
  );

  return {
    bookingCodeCount,
    playersPerBookingCode,
    waitlistPerBookingCode,
    maxPlayers: bookingCodeCount * playersPerBookingCode,
    waitlistCapacity: bookingCodeCount * waitlistPerBookingCode,
  };
}

export function parseCapacityField(
  value: FormDataEntryValue | null,
  fallback: number
): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function waitlistRemaining(
  waitlistCapacity: number,
  waitlistCount: number
): number {
  return Math.max(0, waitlistCapacity - waitlistCount);
}
