"use server";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." };
  }

  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: full_name || null, phone: phone || null })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/settings");
  revalidatePath("/admin");
  return { ok: true };
}

export type ProfileState = { error?: string; ok?: boolean };
