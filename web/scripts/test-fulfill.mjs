import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const sessionId = process.argv[2] || "96cabbca-e569-4c96-aba6-cb09f8565465";

if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key);

const { data: playSession, error: pErr } = await admin
  .from("play_sessions")
  .select("id, title, status, booking_closes_at")
  .eq("id", sessionId)
  .single();

console.log("play_session:", playSession ?? pErr?.message);

const { data: profiles } = await admin
  .from("profiles")
  .select("id, role, full_name")
  .eq("role", "player")
  .limit(3);

console.log("sample players:", profiles?.map((p) => ({ id: p.id, name: p.full_name })));

const { data: bookings } = await admin
  .from("bookings")
  .select("id, status, user_id, stripe_checkout_session_id")
  .eq("play_session_id", sessionId)
  .order("created_at", { ascending: false })
  .limit(5);

console.log("recent bookings:", bookings);
