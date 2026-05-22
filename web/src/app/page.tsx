import { getProfile, getSessionUser } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) {
    const profile = await getProfile();
    if (profile?.role === "admin") redirect("/admin");
    redirect("/sessions");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
      <h1 className="text-3xl font-bold text-white">ShuttleBook</h1>
      <p className="mt-2 text-[#8b949e]">
        Badminton session booking — sign in to book a spot or manage sessions (admin).
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/login"
          className="inline-block rounded-lg bg-[#238636] px-4 py-3 text-center font-medium text-white hover:bg-[#2ea043]"
        >
          Player sign-in (magic link)
        </Link>
        <Link
          href="/admin/login"
          className="inline-block rounded-lg border border-[#30363d] px-4 py-3 text-center text-sm text-[#8b949e] hover:border-[#58a6ff] hover:text-white"
        >
          Admin sign-in (email + password)
        </Link>
      </div>
    </div>
  );
}
