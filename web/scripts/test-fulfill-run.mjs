import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, "../.env.local");
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, key);

const playSessionId = "96cabbca-e569-4c96-aba6-cb09f8565465";
const userId = "3774470e-70fc-4877-b05a-1f951448db43";
const checkoutId = `cs_test_local_${Date.now()}`;

// Inline fulfill logic (mirrors fulfillBooking.ts) for script test
const { data: playSession, error: pErr } = await admin
  .from("play_sessions")
  .select("id, max_players, status")
  .eq("id", playSessionId)
  .single();

const statusOk =
  !pErr && playSession && (playSession.status === "open" || playSession.status === "locked");
console.log("lookup:", { status: playSession?.status, statusOk, err: pErr?.message });

if (!statusOk) process.exit(1);

const { count } = await admin
  .from("bookings")
  .select("*", { count: "exact", head: true })
  .eq("play_session_id", playSessionId)
  .eq("status", "confirmed");

const bookingStatus = (count ?? 0) < playSession.max_players ? "confirmed" : "waitlist";

const { error: insErr } = await admin.from("bookings").insert({
  play_session_id: playSessionId,
  user_id: userId,
  status: bookingStatus,
  stripe_checkout_session_id: checkoutId,
  stripe_payment_intent_id: "pi_test_local",
});

console.log("insert:", insErr ? insErr.message : "ok", bookingStatus);

if (!insErr) {
  await admin.from("bookings").delete().eq("stripe_checkout_session_id", checkoutId);
  console.log("cleaned up test booking");
}
