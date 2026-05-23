import Link from "next/link";

export const metadata = {
  title: "Refunds & cancellation",
};

export default function RefundPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/" className="text-sm text-[#58a6ff] hover:underline">
          ← Home
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">Refunds &amp; cancellation</h1>
        <div className="mt-6 space-y-4 text-sm text-[#e6edf3]">
          <p>
            When you book a session, you pay the booking fee shown on the session page. If you cancel
            (withdraw) before the session starts and while booking is still open, a partial refund is
            issued to your card via Stripe.
          </p>
          <p>
            The refund amount is the booking fee minus the cancellation fee shown for that session. If
            the cancellation fee equals or exceeds the booking fee, contact the organiser — automated
            refund may not be available.
          </p>
          <p>
            If you are on the waitlist and a spot opens, you are moved to confirmed automatically. No
            extra charge applies — you already paid when joining the waitlist.
          </p>
          <p>
            Refunds typically appear on your card within 5–10 business days, depending on your bank.
          </p>
          <p className="text-[#8b949e]">
            For payment issues after cancelling, contact the organiser with your booking details and
            Stripe receipt.
          </p>
        </div>
    </main>
  );
}
