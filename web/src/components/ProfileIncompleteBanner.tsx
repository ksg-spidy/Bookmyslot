import Link from "next/link";

export function ProfileIncompleteBanner() {
  return (
    <div
      className="mt-4 rounded-lg border border-warn/40 bg-warn-soft/40 px-4 py-3 text-sm text-warn"
      role="status"
    >
      <p className="font-medium text-warn">Complete your profile before booking</p>
      <p className="mt-1 text-warn/80">
        Add your name and phone so the organiser can reach you on the player list.
      </p>
      <Link href="/sessions/settings" className="mt-2 inline-block text-link hover:underline">
        Go to profile settings →
      </Link>
    </div>
  );
}
