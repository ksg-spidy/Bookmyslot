import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildWhatsAppBookingConfirmationBody,
  PROMOTION_CONFIRMED_MESSAGE,
} from "@/lib/copy/bookingCopy";
import { formatSessionRange } from "@/lib/datetime";
import { recordNotificationFailure } from "@/lib/notifications/failures";
import { sendWhatsAppText } from "@/lib/whatsapp/sendText";
import { getPromotionTemplateConfig, sendWhatsAppTemplate } from "@/lib/whatsapp/sendTemplate";

export async function notifyWhatsAppBookingConfirmation(opts: {
  admin: SupabaseClient;
  whatsappIdentityId: string;
  playSessionId: string;
  playSession: {
    title: string;
    venue: string;
    starts_at: string;
    ends_at: string;
  };
  status: "confirmed" | "waitlist";
  waitlistPosition: number | null;
  bookingId?: string;
}): Promise<void> {
  const {
    admin,
    whatsappIdentityId,
    playSessionId,
    playSession,
    status,
    waitlistPosition,
    bookingId,
  } = opts;

  const { data: wid } = await admin
    .from("whatsapp_identities")
    .select("wa_id")
    .eq("id", whatsappIdentityId)
    .maybeSingle();

  const to = wid?.wa_id as string | undefined;
  if (!to) {
    await recordNotificationFailure(admin, {
      channel: "whatsapp",
      kind: "booking_confirmation",
      bookingId,
      playSessionId,
      error: `No wa_id for identity ${whatsappIdentityId}`,
    });
    return;
  }

  const body = buildWhatsAppBookingConfirmationBody({
    title: playSession.title ?? "Session",
    venue: playSession.venue ?? "",
    when: formatSessionRange(playSession.starts_at, playSession.ends_at),
    status,
    waitlistPosition,
    playSessionId,
  });

  const sent = await sendWhatsAppText(to, body);
  if (!sent.ok) {
    await recordNotificationFailure(admin, {
      channel: "whatsapp",
      kind: "booking_confirmation",
      recipient: to,
      bookingId,
      playSessionId,
      error: sent.error,
    });
  }
}

/**
 * Tell a paid waitlist player they are confirmed. Free-form text fails outside
 * Meta's 24h window, so when WHATSAPP_TEMPLATE_PROMOTION is configured we fall
 * back to that pre-approved template. Any final failure is recorded for the
 * admin dashboard — this is a money-relevant notice the player must receive.
 */
export async function notifyWhatsAppWaitlistPromoted(opts: {
  admin: SupabaseClient;
  waId: string;
  playSessionId: string;
  bookingId?: string;
}): Promise<void> {
  const { admin, waId, playSessionId, bookingId } = opts;

  const sent = await sendWhatsAppText(waId, `ShuttleBook: ${PROMOTION_CONFIRMED_MESSAGE}`);
  if (sent.ok) return;

  const template = getPromotionTemplateConfig();
  if (template) {
    const templateSent = await sendWhatsAppTemplate(waId, template.name, template.language);
    if (templateSent.ok) return;
    await recordNotificationFailure(admin, {
      channel: "whatsapp",
      kind: "waitlist_promoted",
      recipient: waId,
      bookingId,
      playSessionId,
      error: `free-form: ${sent.error}; template ${template.name}: ${templateSent.error}`,
    });
    return;
  }

  await recordNotificationFailure(admin, {
    channel: "whatsapp",
    kind: "waitlist_promoted",
    recipient: waId,
    bookingId,
    playSessionId,
    error: sent.error,
  });
}
