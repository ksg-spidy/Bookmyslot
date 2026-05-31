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

const { data: sessions, error } = await admin
  .from("play_sessions")
  .select("id, title, status, booking_closes_at, max_players")
  .eq("status", "open")
  .gte("booking_closes_at", new Date().toISOString())
  .limit(5);

if (error) {
  console.log("OPEN_SESSIONS_ERROR", error.message);
  process.exit(1);
}
console.log("OPEN_SESSIONS", sessions?.length ?? 0);
for (const s of sessions ?? []) {
  console.log(`  - ${s.id} | ${s.title} | max ${s.max_players}`);
}

const wa = env.WHATSAPP_ACCESS_TOKEN?.slice(0, 8);
console.log("WHATSAPP_CONFIGURED", Boolean(wa && !wa.includes("...")));
console.log("STRIPE_CONFIGURED", Boolean(env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.includes("...")));
