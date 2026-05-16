export type WaReplyButton = { id: string; title: string };

/** WhatsApp Cloud API: max 3 reply buttons; title max 20 chars (Meta). */
export async function sendWhatsAppInteractiveButtons(
  toWaId: string,
  bodyText: string,
  buttons: [WaReplyButton] | [WaReplyButton, WaReplyButton] | [WaReplyButton, WaReplyButton, WaReplyButton]
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return { ok: false, error: "WhatsApp not configured" };
  }
  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  const normalized = buttons.map((b) => ({
    type: "reply" as const,
    reply: {
      id: b.id.slice(0, 256),
      title: b.title.trim().slice(0, 20),
    },
  }));
  const res = await fetch(url, {
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
        type: "button",
        body: { text: bodyText.slice(0, 1024) },
        action: { buttons: normalized },
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("WhatsApp interactive send failed", res.status, t);
    return { ok: false, error: t };
  }
  return { ok: true };
}
