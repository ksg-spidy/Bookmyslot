"use client";

import { closeOutSessionAction } from "@/app/actions/closeoutSession";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CloseoutButton({ playSessionId }: { playSessionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function onClick() {
    setPending(true);
    setResult(null);
    const res = await closeOutSessionAction(playSessionId);
    setPending(false);
    setResult(res);
    if (res.ok) router.refresh();
  }

  return (
    <div className="mt-4 rounded-lg border border-[#30363d] bg-[#161b22] p-4 text-sm">
      <p className="text-white">Session has started.</p>
      <p className="mt-1 text-[#8b949e]">
        Close out refunds every remaining waitlisted player in full and marks the session done.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => void onClick()}
        className="mt-3 rounded-lg bg-[#238636] px-4 py-2 font-medium text-white hover:bg-[#2ea043] disabled:opacity-60"
      >
        {pending ? "Closing out…" : "Close out session"}
      </button>
      {result ? (
        <p
          className={`mt-2 ${result.ok ? "text-[#3fb950]" : "text-red-400"}`}
          role={result.ok ? "status" : "alert"}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
