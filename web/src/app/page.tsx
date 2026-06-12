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
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <h1 className="text-3xl font-bold text-white">ShuttleBook</h1>
      <p className="mt-2 text-muted">
        Book your spot for club badminton sessions — pay online, see how many places are left, and
        manage your booking anytime before play starts.
      </p>

      <section className="mt-8 rounded-lg border border-edge bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">How it works</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-ink">
          <li>Browse open sessions — no account needed to view times and availability.</li>
          <li>Sign in with a one-time email link and complete your profile.</li>
          <li>Pay to book (or join the waitlist if the session is full).</li>
        </ol>
      </section>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/browse"
          className="inline-block rounded-lg bg-accent px-4 py-3 text-center font-medium text-white hover:bg-accent-hover"
        >
          Browse open sessions
        </Link>
        <Link
          href="/login"
          className="inline-block rounded-lg border border-edge px-4 py-3 text-center font-medium text-white hover:border-link"
        >
          Player sign-in
        </Link>
        <Link
          href="/admin/login"
          className="inline-block rounded-lg px-4 py-3 text-center text-sm text-muted hover:text-white"
        >
          Organiser admin sign-in
        </Link>
      </div>
    </div>
  );
}
