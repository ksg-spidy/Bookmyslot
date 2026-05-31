export async function register() {
  const { warnIfWhatsAppSecretMissing } = await import("@/lib/env");
  warnIfWhatsAppSecretMissing();
}
