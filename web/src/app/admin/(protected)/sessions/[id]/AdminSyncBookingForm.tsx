"use client";

import { adminSyncBookingFromStripe } from "@/app/actions/adminSyncBooking";
import { useRouter } from "next/navigation";
import { useState } from "react";

const inp =
  "w-full max-w-md rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-white outline-none focus:border-[#58a6ff]";

export function AdminSyncBookingForm({ playSessionId }: { playSessionId: string }) {
  const router = useRouter();
  const [checkoutId, setCheckoutId] = useState("");
  const [status, setStatus] = useState<"idle" | "syncing" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("syncing");
    setMessage("");

    const res = await adminSyncBookingFromStripe(playSessionId, checkoutId);
    if (res.ok) {
      setStatus("ok");
      setMessage("Booking saved. Refreshing…");
      setCheckoutId("");
      router.refresh();
      return;
    }
    setStatus("error");
    setMessage(res.error);
  }

  return (
    <details className="mt-6 rounded-lg border border-[#30363d] bg-[#161b22] p-4">
      <summary className="cursor-pointer text-sm text-[#8b949e] hover:text-white">
        Sync booking from Stripe (backfill)
      </summary>
      <p className="mt-2 text-xs text-[#8b949e]">
        Paste a paid Checkout session id (<code className="text-[#c9d1d9]">cs_…</code>) from Stripe if
        payment succeeded but no row appears here.
      </p>
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
        <input
          type="text"
          required
          value={checkoutId}
          onChange={(e) => setCheckoutId(e.target.value)}
          className={inp}
          placeholder="cs_test_…"
          pattern="cs_.+"
          title="Stripe Checkout session id starts with cs_"
        />
        <button
          type="submit"
          disabled={status === "syncing"}
          className="w-fit rounded-lg bg-[#21262d] px-3 py-1.5 text-sm text-white hover:bg-[#30363d] disabled:opacity-60"
        >
          {status === "syncing" ? "Syncing…" : "Sync from Stripe"}
        </button>
      </form>
      {message ? (
        <p
          className={`mt-2 text-sm ${status === "error" ? "text-red-400" : "text-[#3fb950]"}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </details>
  );
}
