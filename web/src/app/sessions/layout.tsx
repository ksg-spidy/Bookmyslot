import { getProfile, getSessionUser } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function SessionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profile = await getProfile();

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#30363d] px-4 py-3">
        <Link href="/sessions" className="font-semibold text-white">
          ShuttleBook
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
          {user.email ? (
            <span className="text-xs text-[#8b949e]" title="Stay signed in on this device">
              {user.email}
            </span>
          ) : null}
          <Link href="/sessions/settings" className="text-sm text-[#8b949e] hover:text-white hover:underline">
            Profile
          </Link>
          {profile?.role === "admin" ? (
            <Link href="/admin" className="text-sm text-[#3fb950] hover:underline">
              Admin
            </Link>
          ) : null}
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-[#58a6ff] hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
