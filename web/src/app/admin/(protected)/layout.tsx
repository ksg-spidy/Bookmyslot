import { getProfile, getSessionUser } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  const profile = await getProfile();
  if (profile?.role !== "admin") {
    redirect("/sessions");
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
        <div className="flex gap-4">
          <Link href="/admin" className="font-semibold text-white">
            ShuttleBook Admin
          </Link>
          <Link href="/sessions" className="text-sm text-[#58a6ff] hover:underline">
            Player view
          </Link>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm text-[#58a6ff] hover:underline">
            Sign out
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
