"use client";

import { createClient } from "@/lib/supabase/client";
import { safeInternalPath } from "@/lib/safeNextPath";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginInner() {
  const searchParams = useSearchParams();
  const nextPath = safeInternalPath(searchParams.get("next")) ?? "/";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    const supabase = createClient();
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: callback,
      },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
    setMessage("Check your email for the magic link.");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 text-2xl font-semibold text-white">ShuttleBook</h1>
      <p className="mb-6 text-sm text-[#8b949e]">
        Sign in with a magic link (admin and players). No password.
      </p>
      {nextPath !== "/" ? (
        <p className="mb-4 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-xs text-[#8b949e]">
          After you sign in, you will return to: <span className="text-[#e6edf3]">{nextPath}</span>
        </p>
      ) : null}
      <form onSubmit={sendLink} className="flex flex-col gap-3">
        <label className="text-xs uppercase tracking-wide text-[#8b949e]">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-white outline-none focus:border-[#58a6ff]"
          placeholder="you@example.com"
          autoComplete="email"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-lg bg-[#238636] py-2 font-medium text-white hover:bg-[#2ea043] disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : "Email me a link"}
        </button>
      </form>
      {message ? (
        <p
          className={`mt-4 text-sm ${status === "error" ? "text-red-400" : "text-[#3fb950]"}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 text-[#8b949e]">
          Loading…
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
