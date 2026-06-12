"use client";

import { withdrawPlayerBooking } from "@/app/actions/withdrawBooking";
import { formatAud } from "@/lib/money";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  // Move keyboard focus into the confirm dialog when it opens, and back to
  // the trigger when it closes, so the flow is operable without a mouse.
  // prevPhaseRef stops the effect from stealing focus on first render.
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (phase === "confirm") {
      confirmButtonRef.current?.focus();
    } else if (prev === "confirm") {
      triggerButtonRef.current?.focus();
    }
  }, [phase]);

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
      <div className="mt-4 space-y-3 rounded-lg border border-edge bg-card p-4 text-sm">
        <p className="text-white">Withdraw from this session?</p>
        <p className="text-muted">
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
            ref={confirmButtonRef}
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
            className="text-link hover:underline"
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
        <p className="mb-2 text-sm text-success" role="status">
          {message}
        </p>
      ) : null}
      <button
        ref={triggerButtonRef}
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
