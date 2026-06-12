import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export type ReconcileDrift = {
  bookingId: string;
  kind: "charge" | "refund";
  stripeCents: number;
  ledgerCents: number;
  detail: string;
};

export type ReconcileResponse = {
  stripe: { grossCents: number; feesCents: number; refundedCents: number; netCents: number };
  ledger: { chargedCents: number; refundedCents: number; netCents: number };
  drift: ReconcileDrift[];
  bookingsChecked: number;
};

/**
 * Pull the session's money state straight from Stripe (payment intents with
 * balance-transaction fees, plus refunds) and diff it against the
 * payment_events ledger. Any drift means a write point was missed or a manual
 * Stripe action happened outside the app.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;

  const profile = await getProfile();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }
  const stripe = new Stripe(secret);

  const supabase = await createClient();

  const { data: bookings, error: bErr } = await supabase
    .from("bookings")
    .select("id, status, stripe_payment_intent_id")
    .eq("play_session_id", sessionId)
    .not("stripe_payment_intent_id", "is", null);

  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 });
  }

  const { data: events, error: eErr } = await supabase
    .from("payment_events")
    .select("booking_id, type, amount_cents")
    .eq("play_session_id", sessionId);

  if (eErr) {
    return NextResponse.json({ error: eErr.message }, { status: 500 });
  }

  const ledgerCharged = new Map<string, number>();
  const ledgerRefunded = new Map<string, number>();
  for (const e of events ?? []) {
    if (!e.booking_id) continue;
    const map = e.type === "refund" ? ledgerRefunded : ledgerCharged;
    map.set(e.booking_id, (map.get(e.booking_id) ?? 0) + e.amount_cents);
  }

  const totals = { grossCents: 0, feesCents: 0, refundedCents: 0 };
  const drift: ReconcileDrift[] = [];

  for (const booking of bookings ?? []) {
    const pi = booking.stripe_payment_intent_id as string;
    const bookingId = booking.id as string;

    let intent: Stripe.PaymentIntent;
    let refundTotal = 0;
    try {
      intent = await stripe.paymentIntents.retrieve(pi, {
        expand: ["latest_charge.balance_transaction"],
      });
      const refunds = await stripe.refunds.list({ payment_intent: pi, limit: 100 });
      refundTotal = refunds.data.reduce((sum, r) => sum + r.amount, 0);
    } catch (err) {
      drift.push({
        bookingId,
        kind: "charge",
        stripeCents: 0,
        ledgerCents: ledgerCharged.get(bookingId) ?? 0,
        detail: `Stripe lookup failed for ${pi}: ${err instanceof Error ? err.message : "unknown error"}`,
      });
      continue;
    }

    const gross = intent.amount_received;
    const charge = intent.latest_charge as Stripe.Charge | null;
    const balanceTx = charge?.balance_transaction as Stripe.BalanceTransaction | null;
    const fee = balanceTx?.fee ?? 0;

    totals.grossCents += gross;
    totals.feesCents += fee;
    totals.refundedCents += refundTotal;

    const ledgerCharge = ledgerCharged.get(bookingId) ?? 0;
    if (ledgerCharge !== gross) {
      drift.push({
        bookingId,
        kind: "charge",
        stripeCents: gross,
        ledgerCents: ledgerCharge,
        detail: `Stripe collected ${gross}c but ledger has ${ledgerCharge}c (intent ${pi}).`,
      });
    }

    const ledgerRefund = ledgerRefunded.get(bookingId) ?? 0;
    if (ledgerRefund !== refundTotal) {
      drift.push({
        bookingId,
        kind: "refund",
        stripeCents: refundTotal,
        ledgerCents: ledgerRefund,
        detail: `Stripe refunded ${refundTotal}c but ledger has ${ledgerRefund}c (intent ${pi}).`,
      });
    }
  }

  // Ledger rows whose booking no longer has a payment intent (e.g. rebooking
  // overwrote it) still count toward ledger totals below.
  let ledgerChargedTotal = 0;
  let ledgerRefundedTotal = 0;
  for (const e of events ?? []) {
    if (e.type === "refund") ledgerRefundedTotal += e.amount_cents;
    else ledgerChargedTotal += e.amount_cents;
  }

  const body: ReconcileResponse = {
    stripe: {
      grossCents: totals.grossCents,
      feesCents: totals.feesCents,
      refundedCents: totals.refundedCents,
      netCents: totals.grossCents - totals.refundedCents - totals.feesCents,
    },
    ledger: {
      chargedCents: ledgerChargedTotal,
      refundedCents: ledgerRefundedTotal,
      netCents: ledgerChargedTotal - ledgerRefundedTotal,
    },
    drift,
    bookingsChecked: (bookings ?? []).length,
  };

  return NextResponse.json(body);
}
