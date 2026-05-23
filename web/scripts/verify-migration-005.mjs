/**
 * Behavioral check: after withdraw, same user can have a new active booking row.
 * Run: node scripts/verify-migration-005.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: withdrawn } = await admin
  .from("bookings")
  .select("id, play_session_id, user_id")
  .eq("status", "withdrawn")
  .not("user_id", "is", null)
  .limit(1)
  .maybeSingle();

if (!withdrawn?.user_id) {
  console.log(
    "SKIP: no withdrawn web booking to probe. Apply 005 in SQL Editor if re-book after withdraw fails."
  );
  process.exit(0);
}

const probeId = `migration005_probe_${Date.now()}`;
const { error } = await admin.from("bookings").insert({
  play_session_id: withdrawn.play_session_id,
  user_id: withdrawn.user_id,
  status: "pending_payment",
  stripe_checkout_session_id: probeId,
});

if (error) {
  if (
    error.message.includes("bookings_play_session_id_user_id_key") ||
    error.code === "23505"
  ) {
    console.error("FAIL: migration 005 likely NOT applied — duplicate user+session blocked.");
    console.error(error.message);
    process.exit(1);
  }
  console.error("Probe insert error:", error.message);
  process.exit(1);
}

await admin.from("bookings").delete().eq("stripe_checkout_session_id", probeId);
console.log("OK: migration 005 behavior verified (re-book row allowed alongside withdrawn).");
