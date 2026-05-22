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

const { data: profiles } = await admin.from("profiles").select("id, role, full_name").eq("role", "admin");
for (const p of profiles ?? []) {
  const { data: user } = await admin.auth.admin.getUserById(p.id);
  console.log(p.full_name, user?.user?.email);
}
