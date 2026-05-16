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
      <Link
        href="/login"
        className="mt-8 inline-block rounded-lg bg-[#238636] px-4 py-3 text-center font-medium text-white hover:bg-[#2ea043]"
      >
        Sign in with email
      </Link>
    </div>
  );
}
