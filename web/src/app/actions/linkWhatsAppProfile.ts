"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function completeWhatsAppProfileLink(token: string): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const t = token.trim();
  if (!t) {
    return { ok: false, error: "Missing link token." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const admin = createServiceClient();
  const now = new Date().toISOString();

  const { data: row, error: fErr } = await admin
    .from("whatsapp_profile_link_tokens")
    .select("id, whatsapp_identity_id, expires_at, used_at")
    .eq("token", t)
    .maybeSingle();

  if (fErr || !row) {
    return { ok: false, error: "Invalid or expired link. Send LINK again from WhatsApp." };
  }

  if (row.used_at) {
    const { data: ident } = await admin
      .from("whatsapp_identities")
      .select("profile_id")
      .eq("id", row.whatsapp_identity_id as string)
      .maybeSingle();
    if (ident?.profile_id === user.id) {
      return { ok: true };
    }
    return { ok: false, error: "This link was already used." };
  }

  if (new Date(row.expires_at as string) < new Date()) {
    return { ok: false, error: "This link has expired. Send LINK again from WhatsApp." };
  }

  const { error: uErr } = await admin
    .from("whatsapp_identities")
    .update({ profile_id: user.id, updated_at: now })
    .eq("id", row.whatsapp_identity_id as string);

  if (uErr) {
    console.error("link profile update", uErr);
    return { ok: false, error: "Could not link this number to your account." };
  }

  const { error: markErr } = await admin
    .from("whatsapp_profile_link_tokens")
    .update({ used_at: now })
    .eq("id", row.id as string);

  if (markErr) {
    console.error("link token mark used", markErr);
  }

  return { ok: true };
}
