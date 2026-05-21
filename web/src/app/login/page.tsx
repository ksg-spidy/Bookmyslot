"use client";

import { authLinkErrorMessage, parseAuthHashFragment } from "@/lib/authLinkErrors";
import { createClient } from "@/lib/supabase/client";
import { formatLoginDestination } from "@/lib/formatLoginDestination";
import { safeInternalPath } from "@/lib/safeNextPath";
import { buildAuthConfirmUrl } from "@/lib/authConfirmUrl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

const RESEND_COOLDOWN_SEC = 60;
const LINK_EXPIRY_LABEL = "1 hour";

function LoginInner() {
  const searchParams = useSearchParams();
  const nextPath = safeInternalPath(searchParams.get("next")) ?? "/";
  const destinationLabel = formatLoginDestination(nextPath);
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"form" | "sent">("form");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [message, setMessage] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const [hashError, setHashError] = useState<{
    errorCode: string | null;
    errorDescription: string | null;
  }>({ errorCode: null, errorDescription: null });

  useEffect(() => {
    setHashError(parseAuthHashFragment(window.location.hash));
  }, []);

  const authError = useMemo(() => {
    if (hashError.errorCode) {
      return authLinkErrorMessage(hashError.errorCode, hashError.errorDescription);
    }
    const queryCode = searchParams.get("error_code");
    const queryDesc = searchParams.get("error_description");
    if (queryCode) return authLinkErrorMessage(queryCode, queryDesc);
    if (searchParams.get("error") === "auth") {
      return authLinkErrorMessage("missing_token", null);
    }
    return null;
  }, [searchParams, hashError]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  async function sendLink(e?: React.FormEvent) {
    e?.preventDefault();
    setStatus("sending");
    setMessage("");
    const supabase = createClient();
    const confirmUrl = buildAuthConfirmUrl(nextPath, window.location.origin);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: confirmUrl,
      },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setPhase("sent");
    setStatus("idle");
    setResendIn(RESEND_COOLDOWN_SEC);
    setMessage("");
  }

  const trimmedEmail = email.trim();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 text-2xl font-semibold text-white">ShuttleBook</h1>
      <p className="mb-6 text-sm text-[#8b949e]">
        Sign in with a one-time email link. No password.
      </p>

      {authError ? (
        <p className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-3 text-sm text-red-300" role="alert">
          {authError}
        </p>
      ) : null}

      {phase === "sent" ? (
        <div className="flex flex-col gap-4">
          <div
            className="rounded-lg border border-[#30363d] bg-[#161b22] px-4 py-4 text-sm text-[#e6edf3]"
            role="status"
          >
            {status === "error" ? (
              <p className="text-red-400">{message}</p>
            ) : (
              <>
                <p className="font-medium text-[#3fb950]">Check your email</p>
                <p className="mt-2 text-[#8b949e]">
                  We sent a sign-in link to{" "}
                  <span className="text-[#e6edf3]">{trimmedEmail}</span> because you asked to sign
                  in to ShuttleBook.
                </p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
                  What happens next
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-[#8b949e]">
                  <li>Open the email and click <strong className="text-[#e6edf3]">Sign in to ShuttleBook</strong>.</li>
                  <li>
                    On the next screen, click <strong className="text-[#e6edf3]">Complete sign-in</strong> (this
                    stops email apps from using your link early).
                  </li>
                  <li>ShuttleBook signs you in automatically — no password.</li>
                  <li>
                    You will land on {destinationLabel}
                    {nextPath !== "/" ? (
                      <>
                            {" "}
                            (<span className="text-[#e6edf3]">{nextPath}</span>)
                          </>
                    ) : null}
                    .
                  </li>
                </ul>
                <p className="mt-3 text-xs text-[#8b949e]">
                  The link expires in {LINK_EXPIRY_LABEL}. If you did not request it, ignore the
                  email. Check spam or promotions if nothing arrives within a few minutes.
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            disabled={status === "sending" || resendIn > 0}
            onClick={() => void sendLink()}
            className="rounded-lg border border-[#30363d] bg-[#161b22] py-2 text-sm text-[#e6edf3] hover:border-[#58a6ff] disabled:opacity-50"
          >
            {status === "sending"
              ? "Sending…"
              : resendIn > 0
                ? `Resend link (${resendIn}s)`
                : "Resend sign-in link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("form");
              setStatus("idle");
              setMessage("");
              setResendIn(0);
            }}
            className="text-sm text-[#58a6ff] hover:underline"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <>
          {nextPath !== "/" ? (
            <p className="mb-4 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-xs text-[#8b949e]">
              After sign-in you will go to {destinationLabel}{" "}
              (<span className="text-[#e6edf3]">{nextPath}</span>).
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
            <p className="text-xs text-[#8b949e]">
              {trimmedEmail
                ? `We will email ${trimmedEmail} a one-time link. No password.`
                : "Enter your email and we will send a one-time sign-in link."}
            </p>
            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-lg bg-[#238636] py-2 font-medium text-white hover:bg-[#2ea043] disabled:opacity-60"
            >
              {status === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
          {status === "error" && message ? (
            <p className="mt-4 text-sm text-red-400" role="alert">
              {message}
            </p>
          ) : null}
        </>
      )}
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
