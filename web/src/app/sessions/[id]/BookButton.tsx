"use client";

import { startCheckout } from "@/app/actions/checkout";
import { getCheckoutButtonLabel, getWaitlistCheckoutHint } from "@/lib/bookings/checkoutLabel";
import { useState } from "react";

export function BookButton({
  sessionId,
  disabled,
  label,
  spotsRemaining,
  bookingFeeCents,
  waitlistCount = 0,
}: {
  sessionId: string;
  disabled?: boolean;
  label?: string;
  spotsRemaining?: number;
  bookingFeeCents?: number;
  waitlistCount?: number;
}) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const full = spotsRemaining !== undefined && spotsRemaining <= 0;
  const buttonLabel =
    label ??
    (spotsRemaining !== undefined && bookingFeeCents !== undefined
      ? getCheckoutButtonLabel({ spotsRemaining, bookingFeeCents })
      : "Pay & book");

  async function onBook() {
    setPending(true);
    setErr(null);
    const res = await startCheckout(sessionId);
    setPending(false);
    if ("error" in res && res.error) {
      setErr(res.error);
      return;
    }
    if ("url" in res && res.url) {
      window.location.href = res.url;
    }
  }

  return (
    <div>
      {full && bookingFeeCents !== undefined ? (
        <p className="mb-2 text-xs text-[#f0c93a]">
          {getWaitlistCheckoutHint(waitlistCount, bookingFeeCents)}
        </p>
      ) : null}
      <button
        type="button"
        disabled={disabled || pending}
        onClick={onBook}
        className="rounded-lg bg-[#238636] px-4 py-2 font-medium text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Redirecting…" : buttonLabel}
      </button>
      {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
    </div>
  );
}
