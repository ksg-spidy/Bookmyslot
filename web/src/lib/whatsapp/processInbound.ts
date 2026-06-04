import { createServiceClient } from "@/lib/supabase/admin";
import { getSessionBookingCounts } from "@/lib/bookings/counts";
import { createWhatsAppCheckout } from "@/lib/checkout/createWhatsAppCheckout";
import {
  getWhatsAppBookIntro,
  getWhatsAppPayButtonLabel,
} from "@/lib/copy/bookingCopy";
import { sendWhatsAppCtaUrl } from "@/lib/whatsapp/sendCtaUrl";
import { sendWhatsAppInteractiveButtons } from "@/lib/whatsapp/sendInteractiveButtons";
import { sendWhatsAppText } from "@/lib/whatsapp/sendText";
import {
  buildMyBookingsMessage,
  buildOpenSessionsListMessage,
  buildStatusMessage,
  fetchOpenSessionsForWa,
  isMyBookingsCommand,
  listWaBookedSessions,
  openSessionListIndex,
  parseCommand,
  resolveOpenSessionByIndex,
} from "@/lib/whatsapp/sessionCommands";
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

async function sendHelp(waId: string): Promise<void> {
  const body =
    "ShuttleBook — tap a button or reply with text.\n\n" +
    "Text: LIST, BOOK, MY, STATUS, ROSTER, WITHDRAW, LINK, HELP\n" +
    "(Multiple sessions? Reply LIST, then BOOK 1, STATUS 2, etc.)";
  const r = await sendWhatsAppInteractiveButtons(waId, body, [
    { id: "LIST", title: "Open sessions" },
    { id: "BOOK", title: "Book a spot" },
    { id: "MY", title: "My bookings" },
  ]);
  if (!r.ok) {
    const fallback = await sendWhatsAppText(
      waId,
      "ShuttleBook\n\nCommands:\n• LIST — open sessions\n• BOOK — pay & book (or BOOK 2)\n• MY — your bookings\n• ROSTER — who's coming\n• STATUS — session details\n• WITHDRAW — withdraw & partial refund\n• LINK — connect to web login\n• HELP — this menu"
    );
    if (!fallback.ok) {
      console.error("WhatsApp HELP reply failed", { interactive: r.error, text: fallback.error });
    }
  }
}

async function sendBookCheckout(
  waId: string,
  playSessionId: string,
  identityId: string,
  opts: { full: boolean; bookingFeeCents: number; waitlistCount: number }
): Promise<void> {
  const res = await createWhatsAppCheckout(playSessionId, identityId);
  if ("error" in res) {
    await sendWhatsAppText(waId, `Could not start checkout: ${res.error}`);
    return;
  }
  const intro = getWhatsAppBookIntro(opts);
  const buttonLabel = getWhatsAppPayButtonLabel(opts.full, opts.bookingFeeCents);
  const cta = await sendWhatsAppCtaUrl(waId, intro, buttonLabel, res.url);
  if (!cta.ok) {
    await sendWhatsAppText(waId, `${intro}\n\n${res.url}`);
  }
}

export async function processInboundWhatsAppMessage(
  msg: WhatsAppInboundMessage,
  contactName?: string
): Promise<void> {
  const admin = createServiceClient();
  // Dedup is handled in api/webhooks/whatsapp/route.ts via claimWhatsAppMessage().

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
    await sendWhatsAppText(waId, "Something went wrong. Reply HELP to try again.");
    return;
  }

  const identityId = identity.id as string;

  const rawCmd = commandFromMessage(msg);

  if (!rawCmd && msg.type !== "text") {
    await sendWhatsAppText(waId, "ShuttleBook: please send a text message or use the menu buttons. Reply HELP.");
    return;
  }

  const { base: cmd, index, withdrawSessionId } = rawCmd
    ? parseCommand(rawCmd)
    : { base: "", index: null, withdrawSessionId: null };

  if (cmd === "HELP" || cmd === "HI" || cmd === "HELLO" || !cmd) {
    await sendHelp(waId);
    return;
  }

  if (cmd === "LIST" || cmd === "SESSIONS") {
    await sendWhatsAppText(waId, await buildOpenSessionsListMessage(admin));
    return;
  }

  if (cmd === "MY" || isMyBookingsCommand(rawCmd ?? "")) {
    await sendWhatsAppText(waId, await buildMyBookingsMessage(admin, identityId));
    return;
  }

  if (cmd === "BOOK") {
    const resolved = await resolveOpenSessionByIndex(admin, index);
    if ("none" in resolved) {
      await sendWhatsAppText(waId, "No open session is available to book right now. Try again later.");
      return;
    }
    if ("needPick" in resolved) {
      await sendWhatsAppText(waId, await buildOpenSessionsListMessage(admin));
      return;
    }
    const counts = await getSessionBookingCounts(
      admin,
      resolved.session.id,
      resolved.session.max_players
    );
    await sendBookCheckout(waId, resolved.session.id, identityId, {
      full: counts.spotsRemaining <= 0,
      bookingFeeCents: resolved.session.booking_fee_cents,
      waitlistCount: counts.waitlist,
    });
    return;
  }

  if (cmd === "STATUS") {
    const resolved = await resolveOpenSessionByIndex(admin, index);
    if ("none" in resolved) {
      await sendWhatsAppText(waId, "No open sessions right now.");
      return;
    }
    if ("needPick" in resolved) {
      await sendWhatsAppText(waId, await buildOpenSessionsListMessage(admin));
      return;
    }
    const openSessions = await fetchOpenSessionsForWa(admin);
    const listIndex = openSessionListIndex(openSessions, resolved.session.id);
    await sendWhatsAppText(
      waId,
      await buildStatusMessage(admin, resolved.session, listIndex)
    );
    return;
  }

  if (cmd === "ROSTER" || cmd === "WHO" || cmd === "WHOSCOMING") {
    const resolved = await resolveOpenSessionByIndex(admin, index);
    if ("none" in resolved) {
      await sendWhatsAppText(waId, "No open sessions right now.");
      return;
    }
    if ("needPick" in resolved) {
      await sendWhatsAppText(waId, await buildOpenSessionsListMessage(admin));
      return;
    }
    const text = await buildRosterMessage(admin, resolved.session.id, identityId);
    await sendWhatsAppText(waId, text ?? "Could not build roster.");
    return;
  }

  if (cmd === "WITHDRAW") {
    const booked = await listWaBookedSessions(admin, identityId);
    if ("none" in booked) {
      await sendWhatsAppText(waId, "You have no active booking to withdraw.");
      return;
    }

    let playSessionId: string | null = null;
    if (booked.sessions.length === 1) {
      playSessionId = booked.sessions[0]!.playSessionId;
    } else if (index != null) {
      playSessionId = booked.sessions[index - 1]?.playSessionId ?? null;
    }

    if (!playSessionId) {
      const lines = booked.sessions
        .map((s) => `${s.index}. ${s.title}`)
        .join("\n");
      await sendWhatsAppText(
        waId,
        `Which booking?\n\n${lines}\n\nReply WITHDRAW 1 (or the session number) to cancel.`
      );
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
    const intro = `Withdraw from this session?\nA $${keep.toFixed(2)} withdrawal fee applies; about $${back.toFixed(2)} would be refunded to your card.`;
    const yesId = `WITHDRAW_YES:${playSessionId}`;
    const r = await sendWhatsAppInteractiveButtons(waId, intro, [
      { id: yesId, title: "Yes, withdraw" },
      { id: "WITHDRAW_NO", title: "Keep my spot" },
    ]);
    if (!r.ok) {
      await sendWhatsAppText(
        waId,
        `${intro}\n\nReply ${yesId} or WITHDRAW_NO.`
      );
    }
    return;
  }

  if (cmd === "WITHDRAW_NO") {
    await sendWhatsAppText(waId, "Great — your spot stays. See you on court.");
    return;
  }

  if (cmd === "WITHDRAW_YES") {
    let sessionId: string | null = withdrawSessionId;
    if (!sessionId) {
      const booked = await listWaBookedSessions(admin, identityId);
      if ("none" in booked) {
        await sendWhatsAppText(waId, "No active booking found.");
        return;
      }
      if (index != null) {
        sessionId = booked.sessions[index - 1]?.playSessionId ?? null;
      } else if (booked.sessions.length === 1) {
        sessionId = booked.sessions[0]!.playSessionId;
      }
    }

    if (!sessionId) {
      await sendWhatsAppText(waId, "Could not find which session to withdraw. Reply WITHDRAW and pick a session.");
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
      playSessionId: sessionId,
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

  await sendWhatsAppText(waId, "Unknown command. Reply HELP or LIST for the menu.");
}
