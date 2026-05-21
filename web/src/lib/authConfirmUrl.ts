import { getSiteOrigin } from "@/lib/siteOrigin";
import { safeInternalPath } from "@/lib/safeNextPath";

/** URL embedded in magic-link emails (must be allow-listed in Supabase). */
export function buildAuthConfirmUrl(nextPath: string, browserOrigin?: string): string {
  const next = safeInternalPath(nextPath) ?? "/";
  const origin = getSiteOrigin(browserOrigin);
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}
