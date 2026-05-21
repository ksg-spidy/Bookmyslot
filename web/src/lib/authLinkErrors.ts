/** User-facing copy for Supabase auth errors on /login and /auth/confirm. */
export function authLinkErrorMessage(
  errorCode: string | null,
  errorDescription: string | null
): string {
  switch (errorCode) {
    case "otp_expired":
      return (
        "This sign-in link has expired or was already used. Request a new link below. " +
        "If you did not click the link yet, your email provider may have opened it automatically — " +
        "use the new link right away, or open the email on the same device and browser where you requested it."
      );
    case "access_denied":
      return errorDescription ?? "Sign-in was denied. Request a new link below.";
    case "pkce_error":
    case "bad_code_verifier":
      return (
        "We could not complete sign-in in this browser. Request a new link and open it in the same " +
        "browser where you entered your email (do not switch devices or in-app email viewers)."
      );
    default:
      if (errorDescription) return decodeURIComponent(errorDescription.replace(/\+/g, " "));
      if (errorCode) return `Sign-in failed (${errorCode}). Request a new link below.`;
      return "Sign-in failed. Request a new link below.";
  }
}

/** Parse `#error_code=...` style hash fragments from Supabase redirects. */
export function parseAuthHashFragment(hash: string): {
  errorCode: string | null;
  errorDescription: string | null;
} {
  if (!hash || hash.length < 2) {
    return { errorCode: null, errorDescription: null };
  }
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    errorCode: params.get("error_code"),
    errorDescription: params.get("error_description"),
  };
}
