import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, "../.env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);

const sid = "96cabbca-e569-4c96-aba6-cb09f8565465";
const uid = "3774470e-70fc-4877-b05a-1f951448db43";
const action = process.argv[2] || "lock";

if (action === "lock") {
  await admin.from("bookings").delete().eq("play_session_id", sid).eq("user_id", uid);
  await admin.from("play_sessions").update({ status: "locked" }).eq("id", sid);
  console.log("locked session, cleared bookings");
} else if (action === "open") {
  await admin.from("play_sessions").update({ status: "open" }).eq("id", sid);
  console.log("session open");
} else if (action === "fulfill") {
  const checkoutId = process.argv[3] || "cs_test_e2e_locked";
  const { data: ps } = await admin.from("play_sessions").select("status, max_players").eq("id", sid).single();
  const { count } = await admin
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("play_session_id", sid)
    .eq("status", "confirmed");
  const status = (count ?? 0) < ps.max_players ? "confirmed" : "waitlist";
  const ok =
    ps.status === "open" || ps.status === "locked";
  if (!ok) {
    console.log("FAIL session status", ps.status);
    process.exit(1);
  }
  const { error } = await admin.from("bookings").insert({
    play_session_id: sid,
    user_id: uid,
    status,
    stripe_checkout_session_id: checkoutId,
    stripe_payment_intent_id: "pi_test_e2e",
  });
  console.log(error ? `insert fail: ${error.message}` : `insert ok ${status} (session ${ps.status})`);
}
