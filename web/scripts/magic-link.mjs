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

const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2] || "udayan.gupta.ndis@gmail.com";
const next = process.argv[3] || "/sessions";
const origin = process.argv[4] || "http://localhost:3000";
const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo },
});

if (error) {
  console.error(error.message);
  process.exit(1);
}

const tokenHash = data.properties?.hashed_token;
if (tokenHash) {
  const confirm = new URL(`${origin}/auth/confirm`);
  confirm.searchParams.set("token_hash", tokenHash);
  confirm.searchParams.set("type", "magiclink");
  confirm.searchParams.set("next", next);
  console.log(confirm.toString());
} else {
  console.log(data.properties?.action_link ?? data.action_link ?? JSON.stringify(data, null, 2));
}
