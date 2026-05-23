"use server";

import { resolvePostLoginPath } from "@/lib/authCallback";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

const OTP_TYPES: EmailOtpType[] = ["magiclink", "email"];

export async function completeMagicLinkSignIn(
  tokenHash: string,
  type: string,
  next: string | null,
  redirectTo: string | null
): Promise<{ error?: string; errorCode?: string }> {
  const trimmed = tokenHash?.trim();
  if (!trimmed || !type?.trim()) {
    return { error: "This sign-in link is incomplete.", errorCode: "missing_token" };
  }

  const supabase = await createClient();
  let lastError: { message: string; code?: string } | null = null;

  const typesToTry: EmailOtpType[] = OTP_TYPES.includes(type as EmailOtpType)
    ? [type as EmailOtpType, ...OTP_TYPES.filter((t) => t !== type)]
    : OTP_TYPES;

  for (const otpType of typesToTry) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: trimmed,
      type: otpType,
    });
    if (!error) {
      redirect(resolvePostLoginPath(next, redirectTo));
    }
    lastError = { message: error.message, code: error.code };
    if (error.code !== "otp_expired" && error.code !== "validation_failed") {
      break;
    }
  }

  return {
    error: lastError?.message ?? "Sign-in failed.",
    errorCode: lastError?.code ?? "verify_failed",
  };
}
