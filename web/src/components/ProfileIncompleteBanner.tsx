import Link from "next/link";

export function ProfileIncompleteBanner() {
  return (
    <div
      className="mt-4 rounded-lg border border-[#6e4c00] bg-[#3d2a00]/40 px-4 py-3 text-sm text-[#f0c93a]"
      role="status"
    >
      <p className="font-medium text-[#f0c93a]">Complete your profile before booking</p>
      <p className="mt-1 text-[#c9b458]">
        Add your name and phone so the organiser can reach you on the player list.
      </p>
      <Link href="/sessions/settings" className="mt-2 inline-block text-[#58a6ff] hover:underline">
        Go to profile settings →
      </Link>
    </div>
  );
}
