/** Same-origin path only — for post-login redirects. */
export function safeInternalPath(next: string | null | undefined): string | null {
  if (!next || typeof next !== "string") return null;
  const t = next.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  return t;
}
