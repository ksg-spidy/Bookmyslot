"use client";

import { withdrawPlayerBooking } from "@/app/actions/withdrawBooking";
import { formatAud } from "@/lib/money";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function WithdrawButton({
  sessionId,
  bookingFeeCents,
  withdrawalFeeCents,
  canWithdraw,
  isWaitlist = false,
}: {
  sessionId: string;
  bookingFeeCents: number;
  withdrawalFeeCents: number;
  canWithdraw: boolean;
  /** Waitlist withdrawals are refunded in full — no withdrawal fee. */
  isWaitlist?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "confirm">("idle");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveFeeCents = isWaitlist ? 0 : withdrawalFeeCents;
  const refundCents = Math.max(0, bookingFeeCents - effectiveFeeCents);

  if (!canWithdraw) {
    return null;
  }

  async function onConfirm() {
    setPending(true);
    setError(null);
    setMessage(null);
    const res = await withdrawPlayerBooking(sessionId);
    setPending(false);
    if (res.ok) {
      setMessage(res.message);
      setPhase("idle");
      router.refresh();
      return;
    }
    setError(res.message);
  }

  if (phase === "confirm") {
    return (
      <div className="mt-4 space-y-3 rounded-lg border border-[#30363d] bg-[#161b22] p-4 text-sm">
        <p className="text-white">Withdraw from this session?</p>
        <p className="text-[#8b949e]">
          {isWaitlist ? (
            <>
              You are on the waitlist, so there is no withdrawal fee. Refund to your card:{" "}
              <strong className="text-white">{formatAud(refundCents)}</strong>.
            </>
          ) : (
            <>
              Withdrawal fee: <strong className="text-white">{formatAud(effectiveFeeCents)}</strong>.
              Refund to your card: <strong className="text-white">{formatAud(refundCents)}</strong>.
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => void onConfirm()}
            className="rounded-lg bg-red-900/80 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-60"
          >
            {pending ? "Withdrawing…" : "Yes, withdraw"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPhase("idle");
              setError(null);
            }}
            className="text-[#58a6ff] hover:underline"
          >
            Keep my spot
          </button>
        </div>
        {error ? (
          <p className="text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4">
      {message ? (
        <p className="mb-2 text-sm text-[#3fb950]" role="status">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => setPhase("confirm")}
        className="text-sm text-red-400 hover:underline"
      >
        {isWaitlist
          ? "Withdraw (full refund)"
          : `Withdraw (refund minus ${formatAud(effectiveFeeCents)} fee)`}
      </button>
    </div>
  );
}
