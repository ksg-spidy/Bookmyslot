/**
 * Apply a SQL migration file via Supabase Management API.
 *
 * Prerequisites:
 *   1. Create token: https://supabase.com/dashboard/account/tokens
 *   2. Add to web/.env.local: SUPABASE_ACCESS_TOKEN=sbp_...
 *
 * Usage (from web/):
 *   node scripts/apply-migration.mjs supabase/migrations/006_promoted_at.sql
 *   node scripts/apply-migration.mjs supabase/migrations/006_promoted_at.sql --dry-run
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const migrationArg = process.argv.find((a) => a.endsWith(".sql"));

if (!migrationArg) {
  console.error("Usage: node scripts/apply-migration.mjs <path/to/migration.sql> [--dry-run]");
  process.exit(1);
}

const migrationPath = resolve(__dirname, "..", migrationArg);
if (!existsSync(migrationPath)) {
  console.error(`Migration file not found: ${migrationPath}`);
  process.exit(1);
}

function loadEnv() {
  const envPath = resolve(__dirname, "../.env.local");
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

function projectRefFromUrl(url) {
  const match = url?.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match?.[1] ?? null;
}

async function columnExists(env) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await admin.from("bookings").select("promoted_at").limit(1);
  if (error?.message?.includes("promoted_at")) return false;
  if (error) throw new Error(error.message);
  return true;
}

const env = loadEnv();
const sql = readFileSync(migrationPath, "utf8").trim();
const projectRef =
  env.SUPABASE_PROJECT_REF ??
  projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL) ??
  "galtalsgxrbqapkfatky";
const token = env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN;

console.log(`Migration: ${migrationArg}`);
console.log(`Project: ${projectRef}`);

if (migrationArg.includes("006_promoted_at")) {
  try {
    const exists = await columnExists(env);
    if (exists === true) {
      console.log("Already applied — bookings.promoted_at exists.");
      process.exit(0);
    }
    if (exists === false) console.log("Column missing — will apply migration.");
  } catch (err) {
    console.warn("Pre-check skipped:", err.message);
  }
}

if (dryRun) {
  console.log("\nDry run — SQL to execute:\n");
  console.log(sql);
  process.exit(0);
}

if (!token) {
  console.error(
    "\nMissing SUPABASE_ACCESS_TOKEN.\n" +
      "Add SUPABASE_ACCESS_TOKEN=sbp_... to web/.env.local (https://supabase.com/dashboard/account/tokens)\n" +
      "Or paste the SQL in Supabase SQL Editor:\n\n" +
      sql +
      "\n"
  );
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

if (!res.ok) {
  console.error("Management API query failed:", res.status, await res.text());
  process.exit(1);
}

console.log("Migration applied successfully.");

if (migrationArg.includes("006_promoted_at")) {
  const exists = await columnExists(env);
  if (exists === true) console.log("Verified — bookings.promoted_at exists.");
  else console.warn("Applied but verification failed — check Supabase dashboard.");
}
