"use client";

import { completeWhatsAppProfileLink } from "@/app/actions/linkWhatsAppProfile";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function LinkInner() {
  const params = useSearchParams();
  const token = params.get("t")?.trim() ?? "";
  const ran = useRef(false);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing token. Send LINK from WhatsApp again.");
      return;
    }
    if (ran.current) return;
    ran.current = true;
    let cancelled = false;
    (async () => {
      setStatus("working");
      const res = await completeWhatsAppProfileLink(token);
      if (cancelled) return;
      if (res.ok) {
        setStatus("done");
        setMessage("This WhatsApp number is now linked to your ShuttleBook account.");
        return;
      }
      if (res.error === "Not signed in.") {
        ran.current = false;
        const next = `/whatsapp/link?t=${encodeURIComponent(token)}`;
        window.location.href = `/login?next=${encodeURIComponent(next)}`;
        return;
      }
      setStatus("error");
      setMessage(res.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 text-2xl font-semibold text-white">Link WhatsApp</h1>
      {status === "working" ? (
        <p className="text-sm text-[#8b949e]">Linking your account…</p>
      ) : null}
      {message ? (
        <p
          className={`mt-4 text-sm ${status === "error" ? "text-red-400" : "text-[#3fb950]"}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
      {status === "done" ? (
        <Link href="/" className="mt-6 text-sm text-[#58a6ff] hover:underline">
          Continue to ShuttleBook
        </Link>
      ) : null}
    </div>
  );
}

export default function WhatsAppLinkPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 text-[#8b949e]">
          Loading…
        </div>
      }
    >
      <LinkInner />
    </Suspense>
  );
}
