import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";

const OTP_TYPE_FALLBACKS: Record<string, EmailOtpType[]> = {
  magiclink: ["magiclink", "email"],
  email: ["email", "magiclink"],
  signup: ["signup", "email", "magiclink"],
};

/** Try verifyOtp with the requested type, then common alternates for signInWithOtp links. */
export async function verifyMagicLinkOtp(
  supabase: SupabaseClient,
  tokenHash: string,
  type: string
): Promise<{ error: { code?: string; message: string } | null }> {
  const candidates = OTP_TYPE_FALLBACKS[type] ?? ([type] as EmailOtpType[]);
  const tried = new Set<string>();
  let lastError: { code?: string; message: string } | null = null;

  for (const otpType of candidates) {
    if (tried.has(otpType)) continue;
    tried.add(otpType);
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    if (!error) return { error: null };
    lastError = { code: error.code, message: error.message };
  }

  return { error: lastError };
}
