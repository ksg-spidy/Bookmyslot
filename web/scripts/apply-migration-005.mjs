/**
 * Apply migration 005 via Supabase Management API (database query).
 * Requires SUPABASE_ACCESS_TOKEN in web/.env.local
 * Usage: node scripts/apply-migration-005.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = "galtalsgxrbqapkfatky";

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
const token = env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN in web/.env.local — create at https://supabase.com/dashboard/account/tokens"
  );
  process.exit(1);
}

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "005_bookings_rebook_after_withdraw.sql"),
  "utf8"
);

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
if (!res.ok) {
  console.error("Apply failed", res.status, body);
  process.exit(1);
}

console.log("Migration 005 applied (or constraint already absent).");
console.log(body || "(ok)");
