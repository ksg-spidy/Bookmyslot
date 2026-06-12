/** Server-only required vars (throws when missing or placeholder). */
export function requireServerEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.includes("...")) {
    throw new Error(`Missing or placeholder environment variable: ${name}`);
  }
  return value;
}

/** Public site origin for metadata and redirects. */
export function getPublicSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  throw new Error("NEXT_PUBLIC_SITE_URL is required in production");
}

/** Shared secret for cron-triggered routes (POST /api/cron/closeout). */
export function getCronSecret(): string | null {
  const value = process.env.CRON_SECRET?.trim();
  return value && !value.includes("...") ? value : null;
}

/** Optional — logs once when WhatsApp webhook cannot verify signatures. */
export function warnIfWhatsAppSecretMissing(): void {
  if (!process.env.WHATSAPP_APP_SECRET?.trim()) {
    console.warn(
      "[ShuttleBook] WHATSAPP_APP_SECRET is not set — POST /api/webhooks/whatsapp will reject all requests"
    );
  }
}
