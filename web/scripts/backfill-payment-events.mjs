/**
 * One-off backfill of the payment_events ledger from existing bookings.
 * Run AFTER applying migration 009.
 *
 * For every booking with a Stripe payment reference:
 *  - inserts a `charge` event (amount from Stripe when STRIPE_SECRET_KEY is
 *    available, otherwise estimated from the session's booking_fee_cents)
 *  - for withdrawn bookings, inserts `refund` events from Stripe's actual
 *    refund records (or an estimate when Stripe is unavailable)
 *
 * Idempotent: rows are keyed on idempotency_key, re-running is safe.
 * Usage: node scripts/backfill-payment-events.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    return Object.fromEntries(
      readFileSync(join(__dirname, "..", ".env.local"), "utf8")
        .split("\n")
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), l.slice(i + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}

const env = { ...loadEnv(), ...process.env };
const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/rest\/v1\/?$/i, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const stripeKey = env.STRIPE_SECRET_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey);

let stripe = null;
if (stripeKey) {
  const { default: Stripe } = await import("stripe");
  stripe = new Stripe(stripeKey);
} else {
  console.warn("No STRIPE_SECRET_KEY — amounts will be ESTIMATED from session fees and noted as such.");
}

const { data: bookings, error } = await admin
  .from("bookings")
  .select(
    "id, play_session_id, status, stripe_checkout_session_id, stripe_payment_intent_id, play_sessions(booking_fee_cents, withdrawal_fee_cents)"
  )
  .not("stripe_payment_intent_id", "is", null);

if (error) {
  console.error("bookings query failed", error);
  process.exit(1);
}

let charges = 0;
let refunds = 0;
let skipped = 0;

for (const b of bookings ?? []) {
  const fees = b.play_sessions ?? {};
  const checkoutId = b.stripe_checkout_session_id;
  const pi = b.stripe_payment_intent_id;
  if (!checkoutId || !pi) {
    skipped += 1;
    continue;
  }

  let chargeCents = fees.booking_fee_cents ?? 0;
  let chargeNote = "backfill_estimated";
  let refundRows = [];

  if (stripe) {
    try {
      const intent = await stripe.paymentIntents.retrieve(pi);
      chargeCents = intent.amount_received ?? intent.amount ?? chargeCents;
      chargeNote = "backfill_from_stripe";
      const refundList = await stripe.refunds.list({ payment_intent: pi, limit: 100 });
      refundRows = refundList.data.map((r) => ({
        amount_cents: r.amount,
        stripe_ref: r.id,
        idempotency_key: `refund:backfill:${r.id}`,
        note: "backfill_from_stripe",
      }));
    } catch (e) {
      console.warn(`Stripe lookup failed for ${pi}: ${e.message} — falling back to estimate`);
    }
  }

  if (!stripe || (b.status === "withdrawn" && refundRows.length === 0)) {
    if (b.status === "withdrawn") {
      const est = Math.max(0, (fees.booking_fee_cents ?? 0) - (fees.withdrawal_fee_cents ?? 0));
      refundRows = [
        {
          amount_cents: est,
          stripe_ref: pi,
          idempotency_key: `refund:backfill:estimated:${b.id}`,
          note: "backfill_estimated",
        },
      ];
    }
  }

  const rows = [
    {
      booking_id: b.id,
      play_session_id: b.play_session_id,
      type: "charge",
      amount_cents: chargeCents,
      stripe_ref: pi,
      idempotency_key: `charge:${checkoutId}`,
      note: chargeNote,
    },
    ...refundRows.map((r) => ({
      booking_id: b.id,
      play_session_id: b.play_session_id,
      type: "refund",
      ...r,
    })),
  ];

  const { error: insErr } = await admin
    .from("payment_events")
    .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true });

  if (insErr) {
    console.error(`insert failed for booking ${b.id}`, insErr);
  } else {
    charges += 1;
    refunds += rows.length - 1;
  }
}

console.log(`Backfill done: ${charges} charges, ${refunds} refunds, ${skipped} skipped (no Stripe refs).`);
