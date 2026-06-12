/**
 * Send a pre-approved Meta template message. Templates work outside the 24h
 * customer-service window, unlike free-form text — used as a fallback for
 * waitlist promotion notices.
 *
 * The env value may be "template_name" or "template_name:lang_code"
 * (default language "en").
 */
export function getPromotionTemplateConfig(): { name: string; language: string } | null {
  const raw = process.env.WHATSAPP_TEMPLATE_PROMOTION?.trim();
  if (!raw) return null;
  const [name, language] = raw.split(":");
  if (!name) return null;
  return { name, language: language?.trim() || "en" };
}

export async function sendWhatsAppTemplate(
  toWaId: string,
  templateName: string,
  languageCode: string
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return { ok: false, error: "WhatsApp not configured" };
  }
  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toWaId,
      type: "template",
      template: { name: templateName, language: { code: languageCode } },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("WhatsApp template send failed", res.status, t);
    return { ok: false, error: t };
  }
  return { ok: true };
}
