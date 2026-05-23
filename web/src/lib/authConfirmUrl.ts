/** Magic-link confirm URL. Always includes `?` so email templates can append `&token_hash=`. */
export function buildAuthConfirmRedirectUrl(origin: string, nextPath: string): string {
  const base = origin.replace(/\/+$/, "");
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  const params = new URLSearchParams({ _sb: "1", next });
  return `${base}/auth/confirm?${params.toString()}`;
}
