import { createServiceClient } from "@/lib/supabase/admin";
import { createWhatsAppCheckout } from "@/lib/checkout/createWhatsAppCheckout";
import { sendWhatsAppCtaUrl } from "@/lib/whatsapp/sendCtaUrl";
import { sendWhatsAppInteractiveButtons } from "@/lib/whatsapp/sendInteractiveButtons";
import { sendWhatsAppText } from "@/lib/whatsapp/sendText";
import { buildRosterMessage, withdrawWhatsappBooking } from "@/lib/whatsapp/waBookingOps";
import { randomBytes } from "crypto";
import Stripe from "stripe";

export type WhatsAppInboundMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
  };
};

function normalizeCommand(body: string): string {
  return body.trim().toUpperCase();
}

function commandFromMessage(msg: WhatsAppInboundMessage): string | null {
  if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
    const id = msg.interactive.button_reply?.id?.trim();
    if (id) return id.toUpperCase();
  }
  if (msg.type === "text" && msg.text?.body) {
    return normalizeCommand(msg.text.body);
  }
  return null;
}

async function resolveDefaultPlaySessionId(admin: ReturnType<typeof createServiceClient>): Promise<string | null> {
  const envId = process.env.WHATSAPP_DEFAULT_PLAY_SESSION_ID?.trim();
  if (envId) {
    const { data } = await admin
      .from("play_sessions")
      .select("id")
      .eq("id", envId)
      .eq("status", "open")
      .maybeSingle();
    if (data?.id) return data.id;
  }
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("play_sessions")
    .select("id")
    .eq("status", "open")
    .gte("booking_closes_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function sendHelp(waId: string): Promise<void> {
  const body =
    "ShuttleBook — tap a button or reply with text.\n\n" +
    "Text: BOOK, STATUS, ROSTER, WITHDRAW, LINK, HELP";
  const r = await sendWhatsAppInteractiveButtons(waId, body, [
    { id: "BOOK", title: "Book a spot" },
    { id: "ROSTER", title: "Who's coming?" },
    { id: "STATUS", title: "Session info" },
  ]);
  if (!r.ok) {
    await sendWhatsAppText(
      waId,
      "ShuttleBook\n\nCommands:\n• BOOK — pay & book\n• ROSTER — who's coming\n• STATUS — session details\n• WITHDRAW — cancel & partial refund\n• LINK — connect this number to your web login\n• HELP — this menu"
    );
  }
}

export async function processInboundWhatsAppMessage(
  msg: WhatsAppInboundMessage,
  contactName?: string
): Promise<void> {
  const admin = createServiceClient();

  const { data: inserted, error: dedupeErr } = await admin
    .from("whatsapp_processed_messages")
    .insert({ wa_message_id: msg.id })
    .select("wa_message_id")
    .maybeSingle();

  if (dedupeErr) {
    const code = (dedupeErr as { code?: string }).code;
    if (code === "23505") {
      return;
    }
    console.error("Dedupe insert failed", dedupeErr);
    return;
  }
  if (!inserted) {
    return;
  }

  const waId = msg.from;
  const { data: identity, error: idErr } = await admin
    .from("whatsapp_identities")
    .upsert(
      { wa_id: waId, display_name: contactName ?? null, updated_at: new Date().toISOString() },
      { onConflict: "wa_id" }
    )
    .select("id")
    .single();

  if (idErr || !identity?.id) {
    console.error("whatsapp identity upsert failed", idErr);
    return;
  }

  const identityId = identity.id as string;

  const cmd = commandFromMessage(msg);

  if (!cmd && msg.type !== "text") {
    await sendWhatsAppText(waId, "ShuttleBook: please send a text message or use the menu buttons. Reply HELP.");
    return;
  }

  if (cmd === "HELP" || cmd === "HI" || cmd === "HELLO" || !cmd) {
    await sendHelp(waId);
    return;
  }

  if (cmd === "BOOK") {
    const playSessionId = await resolveDefaultPlaySessionId(admin);
    if (!playSessionId) {
      await sendWhatsAppText(waId, "No open session is available to book right now. Try again later.");
      return;
    }
    const res = await createWhatsAppCheckout(playSessionId, identityId);
    if ("error" in res) {
      await sendWhatsAppText(waId, `Could not start checkout: ${res.error}`);
      return;
    }
    const cta = await sendWhatsAppCtaUrl(
      waId,
      "Tap the button below to pay securely and confirm your spot.",
      "Pay to book",
      res.url
    );
    if (!cta.ok) {
      await sendWhatsAppText(
        waId,
        "Pay to book (open this link in your browser):\n" + res.url
      );
    }
    return;
  }

  if (cmd === "STATUS") {
    const playSessionId = await resolveDefaultPlaySessionId(admin);
    if (!playSessionId) {
      await sendWhatsAppText(waId, "No default open session.");
      return;
    }
    const { data: s } = await admin
      .from("play_sessions")
      .select("title, venue, booking_closes_at, starts_at, ends_at")
      .eq("id", playSessionId)
      .single();
    if (!s) {
      await sendWhatsAppText(waId, "Session not found.");
      return;
    }
    await sendWhatsAppText(
      waId,
      `${s.title}\n${s.venue}\nStarts: ${s.starts_at}\nBooking closes: ${s.booking_closes_at}\n\nReply BOOK to get a payment link.`
    );
    return;
  }

  if (cmd === "ROSTER" || cmd === "WHO" || cmd === "WHOSCOMING") {
    const playSessionId = await resolveDefaultPlaySessionId(admin);
    if (!playSessionId) {
      await sendWhatsAppText(waId, "No default open session.");
      return;
    }
    const text = await buildRosterMessage(admin, playSessionId, identityId);
    await sendWhatsAppText(waId, text ?? "Could not build roster.");
    return;
  }

  if (cmd === "WITHDRAW") {
    const playSessionId = await resolveDefaultPlaySessionId(admin);
    if (!playSessionId) {
      await sendWhatsAppText(waId, "No default open session.");
      return;
    }
    const { data: session } = await admin
      .from("play_sessions")
      .select("booking_fee_cents, withdrawal_fee_cents")
      .eq("id", playSessionId)
      .single();
    if (!session) {
      await sendWhatsAppText(waId, "Session not found.");
      return;
    }
    const fee = (session.booking_fee_cents as number) / 100;
    const keep = (session.withdrawal_fee_cents as number) / 100;
    const back = fee - keep;
    const intro = `Withdraw from this session?\nA $${keep.toFixed(2)} fee applies; about $${back.toFixed(2)} would be refunded to your card.`;
    const r = await sendWhatsAppInteractiveButtons(waId, intro, [
      { id: "WITHDRAW_YES", title: "Yes, withdraw" },
      { id: "WITHDRAW_NO", title: "Keep my spot" },
    ]);
    if (!r.ok) {
      await sendWhatsAppText(
        waId,
        `${intro}\n\nReply WITHDRAW_YES or WITHDRAW_NO (or tap buttons if your client supports them).`
      );
    }
    return;
  }

  if (cmd === "WITHDRAW_NO") {
    await sendWhatsAppText(waId, "Great — your spot stays. See you on court.");
    return;
  }

  if (cmd === "WITHDRAW_YES") {
    const playSessionId = await resolveDefaultPlaySessionId(admin);
    if (!playSessionId) {
      await sendWhatsAppText(waId, "No default open session.");
      return;
    }
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      await sendWhatsAppText(waId, "Payments are not configured.");
      return;
    }
    const stripe = new Stripe(secret);
    const result = await withdrawWhatsappBooking({
      admin,
      stripe,
      playSessionId,
      whatsappIdentityId: identityId,
      waId,
    });
    await sendWhatsAppText(waId, result.message);
    return;
  }

  if (cmd === "LINK") {
    const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
    if (!site) {
      await sendWhatsAppText(waId, "This ShuttleBook site URL is not configured.");
      return;
    }
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: insErr } = await admin.from("whatsapp_profile_link_tokens").insert({
      token,
      whatsapp_identity_id: identityId,
      expires_at: expiresAt,
    });
    if (insErr) {
      console.error("link token insert", insErr);
      await sendWhatsAppText(
        waId,
        "Could not create a link (database may need migration 003). Ask your admin to run migrations."
      );
      return;
    }
    const url = `${site}/whatsapp/link?t=${encodeURIComponent(token)}`;
    await sendWhatsAppText(
      waId,
      `Open this link on the device where you use ShuttleBook in the browser, sign in with your email magic link, and we will attach this WhatsApp number to your account:\n${url}\n\nLink expires in 24 hours.`
    );
    return;
  }

  await sendWhatsAppText(waId, "Unknown command. Reply HELP for the menu.");
}
