import { ProfileForm } from "@/app/sessions/settings/ProfileForm";
import { getProfile } from "@/lib/auth";
import Link from "next/link";

export default async function SettingsPage() {
  const profile = await getProfile();

  return (
    <div>
      <Link href="/sessions" className="text-sm text-[#58a6ff] hover:underline">
        ← Sessions
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-white">Your profile</h1>
      <p className="mt-1 text-sm text-[#8b949e]">
        This name and phone appear on the admin booking list. Magic link sign-in uses your email from Supabase Auth.
      </p>
      <ProfileForm defaultName={profile?.full_name ?? ""} defaultPhone={profile?.phone ?? ""} />
    </div>
  );
}
