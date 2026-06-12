"use client";

import { authLinkErrorMessage, parseAuthHashFragment } from "@/lib/authLinkErrors";
import { buildAuthConfirmRedirectUrl } from "@/lib/authConfirmUrl";
import { createClient } from "@/lib/supabase/client";
import { formatLoginDestination } from "@/lib/formatLoginDestination";
import { safeInternalPath } from "@/lib/safeNextPath";
import Link from "next/link";
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
    const confirmUrl = buildAuthConfirmRedirectUrl(window.location.origin, nextPath);
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
      <p className="mb-6 text-sm text-muted">
        Player sign-in with a one-time email link.{" "}
        <Link href="/browse" className="text-link hover:underline">
          Browse sessions
        </Link>{" "}
        without signing in.{" "}
        <Link href="/admin/login" className="text-link hover:underline">
          Organiser admin sign-in
        </Link>
        .
      </p>

      {authError ? (
        <p className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-3 text-sm text-red-300" role="alert">
          {authError}
        </p>
      ) : null}

      {phase === "sent" ? (
        <div className="flex flex-col gap-4">
          <div
            className="rounded-lg border border-edge bg-card px-4 py-4 text-sm text-ink"
            role="status"
          >
            {status === "error" ? (
              <p className="text-red-400">{message}</p>
            ) : (
              <>
                <p className="font-medium text-success">Check your email</p>
                <p className="mt-2 text-muted">
                  We sent a sign-in link to{" "}
                  <span className="text-ink">{trimmedEmail}</span> because you asked to sign
                  in to ShuttleBook.
                </p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  What happens next
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-muted">
                  <li>Open the email and click <strong className="text-ink">Sign in to ShuttleBook</strong>.</li>
                  <li>
                    On the next screen, click <strong className="text-ink">Complete sign-in</strong> (this
                    stops email apps from using your link early).
                  </li>
                  <li>ShuttleBook signs you in automatically — no password.</li>
                  <li>
                    You will land on {destinationLabel}
                    {nextPath !== "/" ? (
                      <>
                        {" "}
                        (<span className="text-ink">{nextPath}</span>)
                      </>
                    ) : null}
                    .
                  </li>
                </ul>
                <p className="mt-3 text-xs text-muted">
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
            className="rounded-lg border border-edge bg-card py-2 text-sm text-ink hover:border-link disabled:opacity-50"
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
            className="text-sm text-link hover:underline"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <>
          {nextPath !== "/" ? (
            <p className="mb-4 rounded-lg border border-edge bg-card px-3 py-2 text-xs text-muted">
              After sign-in you will go to {destinationLabel}{" "}
              (<span className="text-ink">{nextPath}</span>).
            </p>
          ) : null}
          <form onSubmit={sendLink} className="flex flex-col gap-3">
            <label htmlFor="login-email" className="text-xs uppercase tracking-wide text-muted">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-edge bg-card px-3 py-2 text-white outline-none focus:border-link"
              placeholder="you@example.com"
              autoComplete="email"
            />
            <p className="text-xs text-muted">
              {trimmedEmail
                ? `We will email ${trimmedEmail} a one-time link. No password.`
                : "Enter your email and we will send a one-time sign-in link."}
            </p>
            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-lg bg-accent py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-60"
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
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 text-muted">
          Loading…
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
