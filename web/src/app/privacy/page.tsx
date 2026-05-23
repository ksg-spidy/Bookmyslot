import Link from "next/link";

export const metadata = {
  title: "Privacy",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/" className="text-sm text-[#58a6ff] hover:underline">
          ← Home
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">Privacy policy</h1>
        <div className="prose prose-invert mt-6 max-w-none space-y-4 text-sm text-[#e6edf3]">
          <p>
            ShuttleBook is operated for club badminton session booking. We collect only what is needed
            to run bookings: your email (for sign-in), name and phone (shown to organisers), and
            payment records handled by Stripe.
          </p>
          <p>
            Session and booking data are stored in Supabase (hosted database). Payment card details are
            never stored on our servers — Stripe processes payments.
          </p>
          <p>
            If you link WhatsApp, your WhatsApp number may be stored to send booking confirmations and
            waitlist updates on that channel.
          </p>
          <p>
            Organisers with admin access can view session rosters (name, phone, booking status) for
            sessions they manage.
          </p>
          <p className="text-[#8b949e]">
            For questions or deletion requests, contact the session organiser or use the contact link in
            the site footer.
          </p>
        </div>
    </main>
  );
}
