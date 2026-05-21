/** Canonical app origin for auth redirects (must match Supabase allow-listed URLs). */
export function getSiteOrigin(browserOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (browserOrigin) return browserOrigin.replace(/\/$/, "");
  return "http://localhost:3000";
}
