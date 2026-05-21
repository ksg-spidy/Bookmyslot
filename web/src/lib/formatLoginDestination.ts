/** Short label for where the user lands after magic-link sign-in. */
export function formatLoginDestination(nextPath: string): string {
  if (nextPath === "/") return "the ShuttleBook home page";
  if (nextPath.startsWith("/whatsapp/link")) return "finish linking your WhatsApp to ShuttleBook";
  if (nextPath.startsWith("/sessions/")) return "continue booking or viewing a session";
  if (nextPath.startsWith("/admin")) return "the admin dashboard";
  if (nextPath.startsWith("/sessions")) return "your sessions list";
  return `ShuttleBook (${nextPath})`;
}
