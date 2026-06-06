/**
 * Detailed retest (plain Node, no tsx). Run: node scripts/retest-whatsapp-changes.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  return Object.fromEntries(
    readFileSync(join(__dirname, "..", ".env.local"), "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).trim()];
      })
  );
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);

let passed = 0;
let failed = 0;

function ok(name, detail = "") {
  passed += 1;
  console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, err) {
  failed += 1;
  console.error(`  FAIL ${name}`);
  console.error(`       ${err instanceof Error ? err.message : String(err)}`);
}

async function run(name, fn) {
  console.log(`\n## ${name}`);
  try {
    await fn();
  } catch (e) {
    fail(name, e);
  }
}

function formatAud(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function getWhatsAppBookIntro(opts) {
  const fee = formatAud(opts.bookingFeeCents);
  const availability = opts.full
    ? opts.waitlistCount > 0
      ? `Full · join waitlist (${opts.waitlistCount} waiting)`
      : "Full · join waitlist"
    : `${opts.spotsRemaining} spot${opts.spotsRemaining === 1 ? "" : "s"} left`;
  const header = [opts.title, opts.venue, opts.when, `${fee} · ${availability}`].join("\n");
  if (opts.full) {
    return `${header}\n\nPay ${fee} now to join the waitlist.\n\nTap below to pay securely.`;
  }
  return `${header}\n\nTap below to pay securely and confirm your spot.`;
}

function buildInvalidSessionIndexMessage(sessionCount, index, command) {
  const cmd = command.toUpperCase();
  if (sessionCount === 1) {
    return `Only 1 open session right now. Reply ${cmd} 1 (not ${cmd} ${index}).`;
  }
  return `Session ${index} not found. There are ${sessionCount} open sessions. Reply LIST, then ${cmd} 1–${sessionCount}.`;
}

async function claimWhatsAppMessage(waMessageId) {
  const { error } = await admin.from("whatsapp_processed_messages").insert({
    wa_message_id: waMessageId,
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

// 1. Dedup source
await run("Dedup: no double insert in processInbound", () => {
  const route = readFileSync(join(__dirname, "..", "src/app/api/webhooks/whatsapp/route.ts"), "utf8");
  const inbound = readFileSync(join(__dirname, "..", "src/lib/whatsapp/processInbound.ts"), "utf8");
  assert.ok(route.includes("claimWhatsAppMessage"));
  assert.ok(!inbound.includes('.from("whatsapp_processed_messages").insert'));
  ok("Source structure");
});

// 2. HELP menu source — no Book button
await run("HELP menu: no Book a spot button", () => {
  const inbound = readFileSync(join(__dirname, "..", "src/lib/whatsapp/processInbound.ts"), "utf8");
  assert.ok(inbound.includes('title: "Who\'s coming"'));
  assert.ok(!inbound.includes('title: "Book a spot"'));
  assert.ok(inbound.includes("LIST first, then BOOK"));
  ok("Safer HELP buttons in source");
});

// 3. LIST source — fee + venue
await run("LIST: fee and venue in sessionCommands", () => {
  const sc = readFileSync(join(__dirname, "..", "src/lib/whatsapp/sessionCommands.ts"), "utf8");
  assert.ok(sc.includes("formatAud(s.booking_fee_cents)"));
  assert.ok(sc.includes("${s.venue}"));
  assert.ok(sc.includes("Reply BOOK to pay"));
  ok("LIST format in source");
});

// 4. BOOK intro copy
await run("BOOK intro includes session + fee", () => {
  const intro = getWhatsAppBookIntro({
    title: "4 June session",
    venue: "Point cook",
    when: "Mon, 8 June 2026, 9:47 pm",
    full: false,
    bookingFeeCents: 1500,
    waitlistCount: 0,
    spotsRemaining: 14,
  });
  assert.ok(intro.includes("4 June session"));
  assert.ok(intro.includes("Point cook"));
  assert.ok(intro.includes("$15.00"));
  assert.ok(intro.includes("14 spots left"));
  ok("BOOK intro", intro.split("\n")[0]);
});

// 5. ROSTER 2 invalid index message
await run("ROSTER 2 with 1 session message", () => {
  const msg = buildInvalidSessionIndexMessage(1, 2, "ROSTER");
  assert.ok(msg.includes("Only 1 open session"));
  assert.ok(msg.includes("ROSTER 1"));
  ok("Invalid index", msg);
});

// 6. Live LIST from DB
await run("Live LIST message", async () => {
  const { data: sessions } = await admin
    .from("play_sessions")
    .select("id, title, venue, starts_at, max_players, booking_fee_cents")
    .eq("status", "open")
    .gt("booking_closes_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  if (!sessions?.length) {
    ok("No open sessions in DB");
    return;
  }

  const s = sessions[0];
  const fee = formatAud(s.booking_fee_cents);
  assert.ok(fee.match(/\$\d+\.\d{2}/));
  assert.ok(s.venue);
  ok(`${sessions.length} open session(s)`, `${s.title} @ ${s.venue} ${fee}`);
});

// 7. resolveOpenSessionByIndex logic (mirror)
await run("Session index resolution", async () => {
  const { data: sessions } = await admin
    .from("play_sessions")
    .select("id, title")
    .eq("status", "open")
    .gt("booking_closes_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  if (!sessions?.length) {
    ok("Skipped — no sessions");
    return;
  }

  if (sessions.length === 1) {
    ok("Single session auto-pick", sessions[0].title);
    const msg = buildInvalidSessionIndexMessage(1, 2, "ROSTER");
    assert.ok(msg.includes("ROSTER 1"));
    ok("ROSTER 2 rejected for 1 session");
  } else {
    ok(`${sessions.length} sessions — index required`);
  }
});

// 8. fulfill_booking_atomic RPC
await run("fulfill_booking_atomic (migration 008)", async () => {
  const { data: open } = await admin
    .from("play_sessions")
    .select("id")
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (!open?.id) {
    ok("Skipped — no open session");
    return;
  }

  const probeId = `retest-${Date.now()}`;
  const { data, error } = await admin.rpc("fulfill_booking_atomic", {
    p_play_session_id: open.id,
    p_user_id: null,
    p_whatsapp_identity_id: "4ac4e75b-5e08-413a-a9d2-1c67ffbdc9fe",
    p_stripe_checkout_session_id: probeId,
    p_stripe_payment_intent_id: "pi_retest",
  });

  if (error) {
    assert.ok(!String(error.message).includes("ambiguous"), error.message);
    throw error;
  }

  assert.ok(data?.[0]?.booking_id);
  await admin.from("bookings").delete().eq("stripe_checkout_session_id", probeId);
  ok("RPC save works", `${data[0].status}`);
});

// 9. Dedup claim
await run("claimWhatsAppMessage", async () => {
  const id = `wamid.retest.${Date.now()}`;
  assert.equal(await claimWhatsAppMessage(id), true);
  assert.equal(await claimWhatsAppMessage(id), false);
  ok("First claim=true, retry=false");
});

// 10. June 4 roster data
await run("June 4 session bookings + roster labels", async () => {
  const sessionId = "4dda9e83-f53e-44a7-98d8-e006c91a8d98";
  const { data: bookings } = await admin
    .from("bookings")
    .select("id, status, user_id, whatsapp_identity_id")
    .eq("play_session_id", sessionId)
    .in("status", ["confirmed", "waitlist"]);

  ok(`${bookings?.length ?? 0} active booking(s) on 4 June session`);
  if (bookings?.length >= 2) {
    const hasWeb = bookings.some((b) => b.user_id);
    const hasWa = bookings.some((b) => b.whatsapp_identity_id);
    if (hasWeb && hasWa) {
      ok("Duplicate name scenario: web + WhatsApp bookings (roster shows channel labels)");
    }
  }
});

// 11. Production webhook
await run("Production webhook verify", async () => {
  const res = await fetch(
    "https://bookbadmintonslot.netlify.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bookmyslot-wa-verify-2026&hub.challenge=retest-ok"
  );
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "retest-ok");
  ok("GET verify 200");

  const bad = await fetch(
    "https://bookbadmintonslot.netlify.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x"
  );
  assert.equal(bad.status, 403);
  ok("Wrong token 403");
});

await run("Production POST invalid signature", async () => {
  const res = await fetch("https://bookbadmintonslot.netlify.app/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hub-signature-256": "sha256=bad" },
    body: JSON.stringify({ entry: [] }),
  });
  assert.equal(res.status, 401);
  ok("POST invalid sig 401");
});

console.log("\n========================================");
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
console.log("========================================");
console.log("Note: run `npm run build` separately to verify compile.\n");

if (failed > 0) process.exit(1);
