/** WhatsApp Cloud API — CTA URL button (shows label instead of raw link). */
export async function sendWhatsAppCtaUrl(
  toWaId: string,
  bodyText: string,
  displayText: string,
  url: string
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return { ok: false, error: "WhatsApp not configured" };
  }

  const apiUrl = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toWaId,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: bodyText.slice(0, 1024) },
        action: {
          name: "cta_url",
          parameters: {
            display_text: displayText.trim().slice(0, 20),
            url: url.slice(0, 2000),
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error("WhatsApp CTA URL send failed", res.status, t);
    return { ok: false, error: t };
  }
  return { ok: true };
}
