import { createHmac, timingSafeEqual } from "crypto";

/** Meta WhatsApp Cloud API — X-Hub-Signature-256 */
export function verifyMetaSignature(
  rawBody: string,
  appSecret: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(signatureHeader, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
