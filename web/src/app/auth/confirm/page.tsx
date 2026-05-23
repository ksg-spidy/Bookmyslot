"use client";

import { completeMagicLinkSignIn } from "@/app/actions/completeMagicLink";
import { authLinkErrorMessage, parseAuthHashFragment } from "@/lib/authLinkErrors";
import { resolvePostLoginPath } from "@/lib/authCallback";
import { formatLoginDestination } from "@/lib/formatLoginDestination";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useTransition } from "react";

function ConfirmInner() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect_to");
  const nextParam = searchParams.get("next");
  const nextPath = resolvePostLoginPath(nextParam, redirectTo);
  const destinationLabel = formatLoginDestination(nextPath);

  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [otpType, setOtpType] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [hashError, setHashError] = useState<{
    errorCode: string | null;
    errorDescription: string | null;
  }>({ errorCode: null, errorDescription: null });

  useEffect(() => {
    setHashError(parseAuthHashFragment(window.location.hash));
  }, []);

  useEffect(() => {
    const fromUrlHash = searchParams.get("token_hash");
    const fromUrlType = searchParams.get("type");
    if (fromUrlHash && fromUrlType) {
      setTokenHash(fromUrlHash);
      setOtpType(fromUrlType);
      const clean = new URL(window.location.href);
      clean.searchParams.delete("token_hash");
      clean.searchParams.delete("type");
      const qs = clean.searchParams.toString();
      window.history.replaceState(
        {},
        "",
        `${clean.pathname}${qs ? `?${qs}` : ""}`
      );
    }
  }, [searchParams]);

  function handleComplete() {
    if (!tokenHash || !otpType) return;
    setSubmitError(null);
    startTransition(async () => {
      const res = await completeMagicLinkSignIn(
        tokenHash,
        otpType,
        nextParam,
        redirectTo
      );
      if (res?.error) {
        setSubmitError(
          authLinkErrorMessage(res.errorCode ?? "verify_failed", res.error)
        );
      }
    });
  }

  if (hashError.errorCode) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        <h1 className="mb-2 text-2xl font-semibold text-white">ShuttleBook</h1>
        <p className="mb-4 text-sm text-red-400" role="alert">
          {authLinkErrorMessage(hashError.errorCode, hashError.errorDescription)}
        </p>
        <Link href="/login" className="text-sm text-[#58a6ff] hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (!tokenHash || !otpType) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        <h1 className="mb-2 text-2xl font-semibold text-white">ShuttleBook</h1>
        <p className="mb-4 text-sm text-red-400" role="alert">
          This sign-in link is incomplete. Request a new link from the login page.
        </p>
        <Link href="/login" className="text-sm text-[#58a6ff] hover:underline">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 text-2xl font-semibold text-white">ShuttleBook</h1>
      <p className="mb-4 text-sm text-[#8b949e]">
        You opened a sign-in link for ShuttleBook. Click below to finish signing in — this step
        prevents email apps from using the link before you do.
      </p>
      <p className="mb-6 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-xs text-[#8b949e]">
        After sign-in you will go to {destinationLabel}
        {nextPath !== "/" ? (
          <>
            {" "}
            (<span className="text-[#e6edf3]">{nextPath}</span>)
          </>
        ) : null}
        .
      </p>
      {submitError ? (
        <p className="mb-4 text-sm text-red-400" role="alert">
          {submitError}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={handleComplete}
        className="rounded-lg bg-[#238636] py-3 text-center font-medium text-white hover:bg-[#2ea043] disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Complete sign-in"}
      </button>
      <p className="mt-4 text-xs text-[#8b949e]">
        Link expires in 1 hour. Use the same browser where you requested the email when possible.
      </p>
      <Link href="/login" className="mt-6 text-sm text-[#58a6ff] hover:underline">
        Request a new link
      </Link>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 text-[#8b949e]">
          Loading…
        </div>
      }
    >
      <ConfirmInner />
    </Suspense>
  );
}
