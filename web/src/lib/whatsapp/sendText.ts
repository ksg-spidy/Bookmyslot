export async function sendWhatsAppText(
  toWaId: string,
  body: string
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
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("WhatsApp send failed", res.status, t);
    return { ok: false, error: t };
  }
  return { ok: true };
}
