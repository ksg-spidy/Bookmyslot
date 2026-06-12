// Concurrency harness for the booking money paths.
//
// Exercises the database primitives that enforce the app's money invariants,
// against a DEV Supabase project and (optionally) a Stripe TEST account:
//   1. last-spot race      — two concurrent fulfill_booking_atomic calls for the
//                            final spot: exactly one confirmed, one waitlisted.
//   2. double fulfillment  — webhook + client-sync replaying the SAME checkout
//                            session id concurrently: exactly one booking row.
//   3. double withdraw     — two concurrent 'confirmed -> withdrawing' claims:
//                            exactly one wins, so exactly one refund can happen.
//                            With a Stripe test key, also proves the refund
//                            idempotency key yields a single refund object.
//   4. webhook replay x3   — three replays of the same checkout id + three
//                            ledger writes with the same idempotency key:
//                            still one booking and one payment_events row.
//
// SAFETY: this script MUTATES the database it points at, so it only runs when
// the dedicated HARNESS_* env vars are set (never read from .env.local):
//   HARNESS_SUPABASE_URL                — dev project URL
//   HARNESS_SUPABASE_SERVICE_ROLE_KEY   — dev service-role key
//   HARNESS_STRIPE_SECRET_KEY           — optional, must start with sk_test_
//
// Run: node scripts/concurrency-harness.mjs   (or npm run test:concurrency)

import { createClient } from "@supabase/supabase-js";

const url = process.env.HARNESS_SUPABASE_URL?.trim();
const key = process.env.HARNESS_SUPABASE_SERVICE_ROLE_KEY?.trim();
const stripeKey = process.env.HARNESS_STRIPE_SECRET_KEY?.trim();

if (!url || !key) {
  console.log(
    "concurrency-harness: HARNESS_SUPABASE_URL / HARNESS_SUPABASE_SERVICE_ROLE_KEY not set — skipping.\n" +
      "Point them at a DEV Supabase project (never production) to run the harness."
  );
  process.exit(0);
}

if (stripeKey && !stripeKey.startsWith("sk_test_")) {
  console.error("concurrency-harness: HARNESS_STRIPE_SECRET_KEY must be a sk_test_ key. Aborting.");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RUN_TAG = `harness-${Date.now()}`;
let failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  PASS ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function createSession(maxPlayers) {
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("play_sessions")
    .insert({
      title: `${RUN_TAG} session`,
      venue: "Harness Court",
      starts_at: startsAt,
      ends_at: endsAt,
      booking_closes_at: startsAt,
      max_players: maxPlayers,
      booking_fee_cents: 1500,
      withdrawal_fee_cents: 200,
      status: "open",
    })
    .select("id")
    .single();
  if (error) throw new Error(`createSession: ${error.message}`);
  return data.id;
}

async function createWaIdentity(label) {
  const { data, error } = await admin
    .from("whatsapp_identities")
    .insert({ wa_id: `${RUN_TAG}-${label}`, display_name: `Harness ${label}` })
    .select("id")
    .single();
  if (error) throw new Error(`createWaIdentity: ${error.message}`);
  return data.id;
}

function fulfill(playSessionId, whatsappIdentityId, checkoutId) {
  return admin.rpc("fulfill_booking_atomic", {
    p_play_session_id: playSessionId,
    p_user_id: null,
    p_whatsapp_identity_id: whatsappIdentityId,
    p_stripe_checkout_session_id: checkoutId,
    p_stripe_payment_intent_id: `pi_${checkoutId}`,
  });
}

async function bookingsFor(playSessionId) {
  const { data, error } = await admin
    .from("bookings")
    .select("id, status, whatsapp_identity_id, stripe_checkout_session_id")
    .eq("play_session_id", playSessionId);
  if (error) throw new Error(`bookingsFor: ${error.message}`);
  return data ?? [];
}

async function testLastSpotRace() {
  console.log("1. Last-spot race");
  // max_players must be >= 4 per schema; pre-fill 3 spots so one remains.
  const sessionId = await createSession(4);
  const fillers = await Promise.all([1, 2, 3].map((i) => createWaIdentity(`fill${i}`)));
  for (const [i, id] of fillers.entries()) {
    const { error } = await fulfill(sessionId, id, `${RUN_TAG}-fill-${i}`);
    if (error) throw new Error(`prefill: ${error.message}`);
  }

  const [a, b] = await Promise.all([createWaIdentity("raceA"), createWaIdentity("raceB")]);
  const [ra, rb] = await Promise.all([
    fulfill(sessionId, a, `${RUN_TAG}-race-a`),
    fulfill(sessionId, b, `${RUN_TAG}-race-b`),
  ]);
  check("both racing fulfillments succeed", !ra.error && !rb.error, ra.error?.message ?? rb.error?.message);

  const rows = await bookingsFor(sessionId);
  const confirmed = rows.filter((r) => r.status === "confirmed");
  const waitlisted = rows.filter((r) => r.status === "waitlist");
  check("exactly 4 confirmed (capacity)", confirmed.length === 4, `got ${confirmed.length}`);
  check("exactly 1 waitlisted (loser of race)", waitlisted.length === 1, `got ${waitlisted.length}`);
  return sessionId;
}

async function testDoubleFulfillmentAndReplay() {
  console.log("2. Double fulfillment (webhook + sync) and 4. webhook replay x3");
  const sessionId = await createSession(4);
  const identity = await createWaIdentity("dupe");
  const checkoutId = `${RUN_TAG}-dupe-checkout`;

  const [r1, r2] = await Promise.all([
    fulfill(sessionId, identity, checkoutId),
    fulfill(sessionId, identity, checkoutId),
  ]);
  check("concurrent duplicate fulfillments do not error", !r1.error && !r2.error, r1.error?.message ?? r2.error?.message);

  for (let i = 0; i < 3; i += 1) {
    const { error } = await fulfill(sessionId, identity, checkoutId);
    check(`replay ${i + 1} does not error`, !error, error?.message);
  }

  const rows = await bookingsFor(sessionId);
  check("exactly one booking row for the checkout", rows.length === 1, `got ${rows.length}`);

  // Ledger idempotency: the same charge key written 3x lands once.
  const ledgerKey = `charge:${checkoutId}`;
  const bookingId = rows[0]?.id;
  for (let i = 0; i < 3; i += 1) {
    const { error } = await admin.from("payment_events").upsert(
      {
        booking_id: bookingId,
        play_session_id: sessionId,
        type: "charge",
        amount_cents: 1500,
        stripe_ref: `pi_${checkoutId}`,
        idempotency_key: ledgerKey,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true }
    );
    check(`ledger replay ${i + 1} does not error`, !error, error?.message);
  }
  const { data: events } = await admin
    .from("payment_events")
    .select("id")
    .eq("idempotency_key", ledgerKey);
  check("exactly one ledger row for the charge key", (events ?? []).length === 1, `got ${(events ?? []).length}`);
  return sessionId;
}

async function testDoubleWithdrawClaim() {
  console.log("3. Concurrent double-withdraw");
  const sessionId = await createSession(4);
  const identity = await createWaIdentity("withdraw");
  const { error: fErr } = await fulfill(sessionId, identity, `${RUN_TAG}-withdraw-checkout`);
  if (fErr) throw new Error(`withdraw seed: ${fErr.message}`);
  const [booking] = await bookingsFor(sessionId);

  // Mirror withdrawBooking's claim: conditional update confirmed -> withdrawing.
  const claim = () =>
    admin
      .from("bookings")
      .update({ status: "withdrawing", updated_at: new Date().toISOString() })
      .eq("id", booking.id)
      .eq("status", "confirmed")
      .select("id");

  const [c1, c2] = await Promise.all([claim(), claim()]);
  const wins = (c1.data?.length ?? 0) + (c2.data?.length ?? 0);
  check("exactly one withdraw claim wins", wins === 1, `got ${wins} winners`);

  if (stripeKey) {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(stripeKey);
    const intent = await stripe.paymentIntents.create({
      amount: 1500,
      currency: "aud",
      payment_method: "pm_card_visa",
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    });
    const idempotencyKey = `refund:withdraw:${booking.id}`;
    const [refA, refB] = await Promise.allSettled([
      stripe.refunds.create({ payment_intent: intent.id, amount: 1300 }, { idempotencyKey }),
      stripe.refunds.create({ payment_intent: intent.id, amount: 1300 }, { idempotencyKey }),
    ]);
    check(
      "concurrent refunds with one idempotency key both resolve",
      refA.status === "fulfilled" && refB.status === "fulfilled",
      `${refA.status}/${refB.status}`
    );
    const refunds = await stripe.refunds.list({ payment_intent: intent.id, limit: 10 });
    check("exactly one refund object exists", refunds.data.length === 1, `got ${refunds.data.length}`);
  } else {
    console.log("  SKIP Stripe refund idempotency (HARNESS_STRIPE_SECRET_KEY not set)");
  }
  return sessionId;
}

async function cleanup(sessionIds) {
  // payment_events.play_session_id is ON DELETE SET NULL; remove harness rows first.
  await admin.from("payment_events").delete().in("play_session_id", sessionIds);
  await admin.from("play_sessions").delete().in("id", sessionIds); // bookings cascade
  await admin.from("whatsapp_identities").delete().like("wa_id", `${RUN_TAG}-%`);
}

const sessionIds = [];
try {
  sessionIds.push(await testLastSpotRace());
  sessionIds.push(await testDoubleFulfillmentAndReplay());
  sessionIds.push(await testDoubleWithdrawClaim());
} finally {
  if (sessionIds.length) {
    await cleanup(sessionIds);
    console.log("Cleaned up harness rows.");
  }
}

if (failures > 0) {
  console.error(`concurrency-harness: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("concurrency-harness: all checks passed.");
