import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentEventType = "charge" | "refund" | "adjustment";

export type PaymentEvent = {
  id: string;
  booking_id: string | null;
  play_session_id: string | null;
  type: PaymentEventType;
  amount_cents: number;
  stripe_ref: string | null;
  idempotency_key: string;
  note: string | null;
  created_at: string;
};

type RecordEventInput = {
  bookingId: string;
  playSessionId: string;
  amountCents: number;
  stripeRef: string | null;
  idempotencyKey: string;
  note?: string;
};

/**
 * Append a ledger row. Safe to call from racing paths (webhook + client sync,
 * retries): the unique idempotency_key means exactly one row lands and
 * duplicates are silently ignored.
 */
async function recordEvent(
  admin: SupabaseClient,
  type: PaymentEventType,
  input: RecordEventInput
): Promise<{ ok: boolean }> {
  const { error } = await admin.from("payment_events").upsert(
    {
      booking_id: input.bookingId,
      play_session_id: input.playSessionId,
      type,
      amount_cents: input.amountCents,
      stripe_ref: input.stripeRef,
      idempotency_key: input.idempotencyKey,
      note: input.note ?? null,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true }
  );

  if (error) {
    // Ledger writes must never take down the money path itself, but a failed
    // ledger write is an ops incident: log loudly so reconcile (Option C) catches it.
    console.error(`payment_events ${type} write failed`, input.idempotencyKey, error);
    return { ok: false };
  }
  return { ok: true };
}

export function recordChargeEvent(admin: SupabaseClient, input: RecordEventInput) {
  return recordEvent(admin, "charge", input);
}

export function recordRefundEvent(admin: SupabaseClient, input: RecordEventInput) {
  return recordEvent(admin, "refund", input);
}

export function chargeKeyForCheckout(checkoutSessionId: string): string {
  return `charge:${checkoutSessionId}`;
}

export function refundKeyForWithdrawal(bookingId: string): string {
  return `refund:withdraw:${bookingId}`;
}

export function refundKeyForCloseout(bookingId: string): string {
  return `refund:closeout:${bookingId}`;
}

export type SessionMoneySummary = {
  collectedCents: number;
  refundedCents: number;
  feesRetainedCents: number;
  netHeldCents: number;
  eventCount: number;
};

export function summarizeEvents(events: Pick<PaymentEvent, "type" | "amount_cents">[]): SessionMoneySummary {
  let collected = 0;
  let refunded = 0;
  for (const e of events) {
    if (e.type === "charge") collected += e.amount_cents;
    else if (e.type === "refund") refunded += e.amount_cents;
    else collected += e.amount_cents; // signed adjustments are stored as positive charge-like corrections
  }
  return {
    collectedCents: collected,
    refundedCents: refunded,
    feesRetainedCents: 0, // computed per-booking where charge/refund pairs exist; see getSessionMoneySummary
    netHeldCents: collected - refunded,
    eventCount: events.length,
  };
}

/**
 * Money summary for one session, summed from the ledger.
 * Fees retained = for each booking that has both a charge and at least one
 * refund, the difference between charged and refunded amounts.
 */
export async function getSessionMoneySummary(
  admin: SupabaseClient,
  playSessionId: string
): Promise<SessionMoneySummary> {
  const { data, error } = await admin
    .from("payment_events")
    .select("booking_id, type, amount_cents")
    .eq("play_session_id", playSessionId);

  if (error) {
    console.error("getSessionMoneySummary", playSessionId, error);
    return { collectedCents: 0, refundedCents: 0, feesRetainedCents: 0, netHeldCents: 0, eventCount: 0 };
  }

  const events = (data ?? []) as Pick<PaymentEvent, "booking_id" | "type" | "amount_cents">[];
  const summary = summarizeEvents(events);
  summary.feesRetainedCents = computeFeesRetained(events);
  return summary;
}

export function computeFeesRetained(
  events: Pick<PaymentEvent, "booking_id" | "type" | "amount_cents">[]
): number {
  const charged = new Map<string, number>();
  const refunded = new Map<string, number>();
  for (const e of events) {
    if (!e.booking_id) continue;
    const map = e.type === "refund" ? refunded : charged;
    map.set(e.booking_id, (map.get(e.booking_id) ?? 0) + e.amount_cents);
  }
  let retained = 0;
  for (const [bookingId, refundTotal] of refunded) {
    const chargeTotal = charged.get(bookingId) ?? 0;
    if (chargeTotal > refundTotal) retained += chargeTotal - refundTotal;
  }
  return retained;
}

/** Money summaries for many sessions at once (admin dashboard totals). */
export async function getMoneySummariesForSessions(
  admin: SupabaseClient,
  playSessionIds: string[]
): Promise<Map<string, SessionMoneySummary>> {
  const map = new Map<string, SessionMoneySummary>();
  if (!playSessionIds.length) return map;

  const { data, error } = await admin
    .from("payment_events")
    .select("play_session_id, booking_id, type, amount_cents")
    .in("play_session_id", playSessionIds);

  if (error) {
    console.error("getMoneySummariesForSessions", error);
    return map;
  }

  const bySession = new Map<string, Pick<PaymentEvent, "booking_id" | "type" | "amount_cents">[]>();
  for (const row of (data ?? []) as Pick<PaymentEvent, "play_session_id" | "booking_id" | "type" | "amount_cents">[]) {
    if (!row.play_session_id) continue;
    const list = bySession.get(row.play_session_id) ?? [];
    list.push(row);
    bySession.set(row.play_session_id, list);
  }

  for (const id of playSessionIds) {
    const events = bySession.get(id) ?? [];
    const summary = summarizeEvents(events);
    summary.feesRetainedCents = computeFeesRetained(events);
    map.set(id, summary);
  }
  return map;
}
