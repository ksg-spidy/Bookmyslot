import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[#30363d] px-4 py-6 text-center text-xs text-[#8b949e]">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <Link href="/privacy" className="hover:text-white hover:underline">
          Privacy
        </Link>
        <Link href="/refund" className="hover:text-white hover:underline">
          Refunds &amp; cancellation
        </Link>
        <a
          href="mailto:support@bookbadmintonslot.netlify.app"
          className="hover:text-white hover:underline"
        >
          Contact
        </a>
      </nav>
      <p className="mt-3">ShuttleBook — club badminton session booking.</p>
    </footer>
  );
}
