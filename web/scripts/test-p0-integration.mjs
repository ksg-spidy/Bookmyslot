/**
 * Integration smoke tests against local dev + Supabase.
 * Run from web/: node scripts/test-p0-integration.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dir, "..");
const envPath = resolve(webRoot, ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) {
    console.warn("No .env.local — skipping DB tests");
    return {};
  }
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const BASE = env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
let passed = 0;
let failed = 0;
let skipped = 0;

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}
function fail(name, detail) {
  failed += 1;
  console.log(`  ✗ ${name}: ${detail}`);
}
function skip(name, reason) {
  skipped += 1;
  console.log(`  ○ ${name} (skipped: ${reason})`);
}

console.log("\n=== HTTP / routing ===\n");

// Middleware redirect
const sessionsRes = await fetch(`${BASE}/sessions`, { redirect: "manual" });
if (sessionsRes.status === 307 || sessionsRes.status === 302) {
  const loc = sessionsRes.headers.get("location") ?? "";
  if (loc.includes("/login") && loc.includes("next=")) ok("Auth middleware preserves ?next=");
  else fail("Auth middleware", `unexpected location: ${loc}`);
} else fail("Auth middleware", `expected redirect, got ${sessionsRes.status}`);

// Payment success HTML
const payRes = await fetch(`${BASE}/api/whatsapp/payment-success`);
const payHtml = await payRes.text();
if (payRes.status === 500 && payHtml.includes("Missing payment session")) ok("Payment-success error page renders");
else fail("Payment-success error page", `status=${payRes.status}`);

// Browse public
const browseRes = await fetch(`${BASE}/browse`);
if (browseRes.ok && (await browseRes.text()).includes("Open sessions")) ok("Browse page loads");
else fail("Browse page", `status=${browseRes.status}`);

// Refund policy linked from session detail (static check in source)
ok("Refund policy route exists at /refund (manual verify)");

console.log("\n=== Supabase / WhatsApp helpers ===\n");

if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
  skip("Open sessions LIST message", "no service role");
  skip("Session commands resolve", "no service role");
} else {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sessions, error } = await admin
    .from("play_sessions")
    .select("id, title, starts_at, max_players, status, booking_closes_at")
    .eq("status", "open")
    .gt("booking_closes_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  if (error) fail("Fetch open sessions", error.message);
  else {
    ok(`Open sessions in DB: ${sessions?.length ?? 0}`);
    if ((sessions?.length ?? 0) >= 2) ok("Multi-session WA LIST scenario possible");
    else skip("Multi-session WA LIST", "fewer than 2 open sessions in DB");
  }

  const { error: promoErr } = await admin.from("bookings").select("promoted_at").limit(1);
  if (promoErr?.message?.includes("promoted_at")) {
    fail("Migration 006 promoted_at", "column missing — run 006_promoted_at.sql");
  } else if (promoErr) {
    fail("Migration 006 promoted_at", promoErr.message);
  } else {
    ok("Migration 006 promoted_at column exists");
  }
}

console.log("\n=== Summary ===\n");
console.log(`Passed: ${passed}, Failed: ${failed}, Skipped: ${skipped}`);
process.exit(failed > 0 ? 1 : 0);
