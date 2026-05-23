import Link from "next/link";

export function SiteHeader({
  signedIn,
  isAdmin,
}: {
  signedIn: boolean;
  isAdmin?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#30363d] px-4 py-3">
      <Link href={signedIn ? "/sessions" : "/"} className="font-semibold text-white">
        ShuttleBook
      </Link>
      <nav className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/browse" className="text-[#8b949e] hover:text-white hover:underline">
          Browse sessions
        </Link>
        {signedIn ? (
          <>
            <Link href="/sessions" className="text-[#8b949e] hover:text-white hover:underline">
              Sessions
            </Link>
            <Link href="/sessions/bookings" className="text-[#8b949e] hover:text-white hover:underline">
              My bookings
            </Link>
            <Link href="/sessions/settings" className="text-[#8b949e] hover:text-white hover:underline">
              Profile
            </Link>
            {isAdmin ? (
              <Link href="/admin" className="text-[#3fb950] hover:underline">
                Admin
              </Link>
            ) : null}
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-[#58a6ff] hover:underline">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <Link href="/login" className="text-[#58a6ff] hover:underline">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
