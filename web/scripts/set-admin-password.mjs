/**
 * Set an admin user's password without sending email (bypasses Supabase built-in SMTP rate limits).
 *
 * Usage (from web/):
 *   node scripts/set-admin-password.mjs <email> <password>
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  return Object.fromEntries(
    readFileSync(resolve(__dirname, "../.env.local"), "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

async function findUserByEmail(admin, email) {
  const target = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

const email = process.argv[2];
const password = process.argv[3];
const dryRun = process.argv.includes("--dry-run");

if (!email || (!password && !dryRun)) {
  console.error(
    "Usage: node scripts/set-admin-password.mjs <email> <password>\n" +
      "       node scripts/set-admin-password.mjs <email> --dry-run"
  );
  process.exit(1);
}

if (!dryRun && password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const user = await findUserByEmail(admin, email);
if (!user) {
  console.error(`No auth user found for ${email}`);
  process.exit(1);
}

if (dryRun) {
  console.log("User:", user.id, user.email, "confirmed:", !!user.email_confirmed_at);
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  console.log("Profile role:", profile?.role ?? "(no profile)");
  process.exit(0);
}

const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true,
});
if (updateError) {
  console.error("updateUserById:", updateError.message);
  process.exit(1);
}

const { error: roleError } = await admin
  .from("profiles")
  .update({ role: "admin" })
  .eq("id", user.id);
if (roleError) {
  console.error("profiles update:", roleError.message);
  process.exit(1);
}

console.log(`Password updated for ${email}. Sign in at /admin/login`);
