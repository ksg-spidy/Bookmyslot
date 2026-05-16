"use client";

import { startCheckout } from "@/app/actions/checkout";
import { useState } from "react";

export function BookButton({
  sessionId,
  disabled,
  label,
}: {
  sessionId: string;
  disabled?: boolean;
  label?: string;
}) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      <button
        type="button"
        disabled={disabled || pending}
        onClick={onBook}
        className="rounded-lg bg-[#238636] px-4 py-2 font-medium text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Redirecting…" : label ?? "Pay & book"}
      </button>
      {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
    </div>
  );
}
