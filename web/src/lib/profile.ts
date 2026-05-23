import type { Profile } from "@/lib/auth";

export function isProfileComplete(profile: Pick<Profile, "full_name" | "phone"> | null): boolean {
  if (!profile) return false;
  return Boolean(profile.full_name?.trim() && profile.phone?.trim());
}
