import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  role: "admin" | "player";
  full_name: string | null;
  phone: string | null;
};

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone")
    .eq("id", user.id)
    .single();
  if (error || !data) return null;
  return data as Profile;
}
