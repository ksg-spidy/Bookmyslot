"use client";

import { adminWithdrawBooking } from "@/app/actions/adminWithdrawBooking";
import { formatAud } from "@/lib/money";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminWithdrawBookingButton({
  playSessionId,
  bookingId,
  playerName,
  bookingFeeCents,
  withdrawalFeeCents,
}: {
  playSessionId: string;
  bookingId: string;
  playerName: string;
  bookingFeeCents: number;
  withdrawalFeeCents: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setMessage(null);
    setError(null);
    const result = await adminWithdrawBooking(playSessionId, bookingId);
    setPending(false);

    if (result.ok) {
      setMessage(result.message);
      setConfirming(false);
      router.refresh();
      return;
    }

    setError(result.message);
  }

  if (confirming) {
    return (
      <div className="min-w-56 rounded-lg border border-red-900/70 bg-red-950/20 p-3 text-xs">
        <p className="font-medium text-white">Withdraw {playerName}?</p>
        <p className="mt-1 text-[#8b949e]">
          Refund {formatAud(Math.max(0, bookingFeeCents - withdrawalFeeCents))}; fee{" "}
          {formatAud(withdrawalFeeCents)}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => void onConfirm()}
            className="rounded-md bg-red-900/80 px-3 py-1.5 font-medium text-white hover:bg-red-800 disabled:opacity-60"
          >
            {pending ? "Withdrawing..." : "Yes, withdraw"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            className="rounded-md border border-[#30363d] px-3 py-1.5 text-[#8b949e] hover:text-white disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
        {error ? (
          <p className="mt-2 text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {message ? (
        <p className="text-xs text-[#3fb950]" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-800 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-950/30"
      >
        Withdraw
      </button>
    </div>
  );
}
