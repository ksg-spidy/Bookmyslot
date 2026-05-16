import { verifyMetaSignature } from "@/lib/whatsapp/verifySignature";
import { processInboundWhatsAppMessage, type WhatsAppInboundMessage } from "@/lib/whatsapp/processInbound";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const raw = await request.text();
  const sig = request.headers.get("x-hub-signature-256");
  if (!appSecret || !verifyMetaSignature(raw, appSecret, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
          messages?: WhatsAppInboundMessage[];
        };
      }>;
    }>;
  };

  const entries = b.entry ?? [];
  for (const ent of entries) {
    for (const ch of ent.changes ?? []) {
      const val = ch.value;
      const messages = val?.messages;
      if (!messages?.length) continue;
      const contactName = val?.contacts?.[0]?.profile?.name;
      for (const msg of messages) {
        await processInboundWhatsAppMessage(msg, contactName);
      }
    }
  }

  return NextResponse.json({ received: true });
}
