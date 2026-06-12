import Link from "next/link";

export function SiteHeader({
  signedIn,
  isAdmin,
}: {
  signedIn: boolean;
  isAdmin?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
      <Link href={signedIn ? "/sessions" : "/"} className="font-semibold text-white">
        ShuttleBook
      </Link>
      <nav className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/browse" className="text-muted hover:text-white hover:underline">
          Browse sessions
        </Link>
        {signedIn ? (
          <>
            <Link href="/sessions" className="text-muted hover:text-white hover:underline">
              Sessions
            </Link>
            <Link href="/sessions/bookings" className="text-muted hover:text-white hover:underline">
              My bookings
            </Link>
            <Link href="/sessions/settings" className="text-muted hover:text-white hover:underline">
              Profile
            </Link>
            {isAdmin ? (
              <Link href="/admin" className="text-success hover:underline">
                Admin
              </Link>
            ) : null}
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-link hover:underline">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <Link href="/login" className="text-link hover:underline">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
