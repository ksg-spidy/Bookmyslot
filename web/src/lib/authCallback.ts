import { safeInternalPath } from "@/lib/safeNextPath";

/** Resolve post-login path from `next` or nested `redirect_to` (emailRedirectTo). */
export function resolvePostLoginPath(
  next: string | null,
  redirectTo: string | null
): string {
  const direct = safeInternalPath(next);
  if (direct) return direct;

  if (!redirectTo) return "/";

  try {
    const nested = new URL(redirectTo);
    return safeInternalPath(nested.searchParams.get("next")) ?? "/";
  } catch {
    return "/";
  }
}
