/**
 * Verify WhatsApp Cloud API credentials match a usable business number.
 *
 * Usage (from web/):
 *   node scripts/verify-whatsapp-config.mjs
 *
 * Reads from web/.env.local:
 *   WHATSAPP_ACCESS_TOKEN
 *   WHATSAPP_PHONE_NUMBER_ID
 *
 * Optional: pass phone digits to compare, e.g. node scripts/verify-whatsapp-config.mjs 61412345678
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!val.includes("...") && val !== "your_stripe_secret_key") env[m[1]] = val;
    }
  } catch {
    /* missing file */
  }
  return env;
}

const env = loadEnv();
const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const expectedDigits = (process.argv[2] ?? "").replace(/\D/g, "");

if (!token || !phoneNumberId) {
  console.error(
    "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID in web/.env.local\n" +
      "Get both from Meta → Developer App → WhatsApp → API Setup"
  );
  process.exit(1);
}

const apiVersion = "v21.0";
const base = `https://graph.facebook.com/${apiVersion}`;

async function get(path) {
  const url = `${base}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

console.log("Checking WhatsApp Cloud API credentials...\n");

const phone = await get(
  `/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput`
);

if (!phone.ok) {
  console.error("FAIL — could not read Phone number ID");
  console.error("Status:", phone.status);
  console.error("Error:", phone.json.error?.message ?? JSON.stringify(phone.json));
  console.error("\nCommon causes:");
  console.error("  • Wrong WHATSAPP_PHONE_NUMBER_ID (must be numeric ID, not phone digits)");
  console.error("  • Expired or wrong WHATSAPP_ACCESS_TOKEN");
  console.error("  • Token does not have access to this WABA / phone number");
  process.exit(1);
}

const p = phone.json;
const display = String(p.display_phone_number ?? "");
const displayDigits = display.replace(/\D/g, "");

console.log("OK — token can access this WhatsApp business number:\n");
console.log("  Phone number ID:  ", p.id);
console.log("  Display number:   ", display || "(hidden)");
console.log("  Verified name:    ", p.verified_name ?? "(none yet)");
console.log("  Platform:         ", p.platform_type ?? "—");
console.log("  Code verification:", p.code_verification_status ?? "—");
console.log("  Quality rating:   ", p.quality_rating ?? "—");

if (expectedDigits) {
  if (displayDigits.endsWith(expectedDigits) || displayDigits.includes(expectedDigits)) {
    console.log("\nOK — display number matches what you expected.");
  } else {
    console.warn("\nWARN — display number may NOT match your business WhatsApp.");
    console.warn("  Expected digits:", expectedDigits);
    console.warn("  API shows:      ", display);
  }
}

const wabaProbe = await get(`/${phoneNumberId}?fields=whatsapp_business_account`);
if (wabaProbe.ok && wabaProbe.json.whatsapp_business_account?.id) {
  const wabaId = wabaProbe.json.whatsapp_business_account.id;
  console.log("\n  WABA ID:          ", wabaId);

  const waba = await get(`/${wabaId}?fields=id,name,timezone_id,message_template_namespace`);
  if (waba.ok) {
    console.log("  WABA name:        ", waba.json.name ?? "—");
  }
}

console.log("\n--- What this means for ShuttleBook ---");
console.log("If you see OK above, this number can send/receive via Cloud API");
console.log("(once webhook + Netlify env vars are set).");
console.log("\nYour Facebook Page is separate — it should live in the SAME Business");
console.log("Portfolio as this WABA, but ShuttleBook does not use the Page ID directly.");
console.log("\nNext test: message this number with HELP after webhook is configured.");
