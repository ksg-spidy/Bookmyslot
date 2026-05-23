/**
 * Apply ShuttleBook magic-link template + production redirect URLs via Supabase Management API.
 *
 * Prerequisites:
 *   1. Create token: https://supabase.com/dashboard/account/tokens
 *   2. Add to web/.env.local: SUPABASE_ACCESS_TOKEN=sbp_...
 *
 * Usage (from web/):
 *   node scripts/apply-supabase-auth-config.mjs
 *   node scripts/apply-supabase-auth-config.mjs --dry-run
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");

const PRODUCTION_SITE = "https://bookbadmintonslot.netlify.app";
const PROJECT_REF = "galtalsgxrbqapkfatky";

const REDIRECT_ENTRIES = [
  "http://localhost:3000/auth/callback",
  "http://localhost:3000/auth/confirm**",
  "http://localhost:3000/**",
  `${PRODUCTION_SITE}/auth/callback**`,
  `${PRODUCTION_SITE}/auth/confirm**`,
  `${PRODUCTION_SITE}/**`,
];

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

function mergeAllowList(existing) {
  const parts = (existing ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const set = new Set(parts);
  for (const entry of REDIRECT_ENTRIES) set.add(entry);
  return [...set].join(",");
}

const env = loadEnv();
const token = env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN.\n" +
      "Create one at https://supabase.com/dashboard/account/tokens\n" +
      "Then add SUPABASE_ACCESS_TOKEN=sbp_... to web/.env.local and re-run."
  );
  process.exit(1);
}

const magicLinkHtml = readFileSync(
  resolve(__dirname, "../supabase/email-templates/magic-link.html"),
  "utf8"
);
const magicLinkSubject = readFileSync(
  resolve(__dirname, "../supabase/email-templates/magic-link-subject.txt"),
  "utf8"
).trim();

const apiBase = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const getRes = await fetch(apiBase, { headers });
if (!getRes.ok) {
  console.error("GET config/auth failed:", getRes.status, await getRes.text());
  process.exit(1);
}
const current = await getRes.json();

const patchBody = {
  site_url: PRODUCTION_SITE,
  uri_allow_list: mergeAllowList(current.uri_allow_list),
  mailer_subjects_magic_link: magicLinkSubject,
  mailer_templates_magic_link_content: magicLinkHtml,
};

console.log("Will apply:");
console.log("  site_url:", patchBody.site_url);
console.log("  uri_allow_list:", patchBody.uri_allow_list);
console.log("  mailer_subjects_magic_link:", patchBody.mailer_subjects_magic_link);
console.log("  mailer_templates_magic_link_content:", `${magicLinkHtml.length} chars`);

if (dryRun) {
  console.log("\nDry run — no changes sent.");
  process.exit(0);
}

const patchRes = await fetch(apiBase, {
  method: "PATCH",
  headers,
  body: JSON.stringify(patchBody),
});

if (!patchRes.ok) {
  console.error("PATCH config/auth failed:", patchRes.status, await patchRes.text());
  process.exit(1);
}

console.log("\nSupabase auth config updated successfully.");
console.log("Request a new magic link from", `${PRODUCTION_SITE}/login`);
