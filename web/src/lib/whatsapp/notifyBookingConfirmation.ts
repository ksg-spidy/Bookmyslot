import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildWhatsAppBookingConfirmationBody,
  PROMOTION_CONFIRMED_MESSAGE,
} from "@/lib/copy/bookingCopy";
import { formatSessionRange } from "@/lib/datetime";
import { sendWhatsAppText } from "@/lib/whatsapp/sendText";

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
}): Promise<void> {
  const { admin, whatsappIdentityId, playSessionId, playSession, status, waitlistPosition } =
    opts;

  const { data: wid } = await admin
    .from("whatsapp_identities")
    .select("wa_id")
    .eq("id", whatsappIdentityId)
    .maybeSingle();

  const to = wid?.wa_id as string | undefined;
  if (!to) {
    console.error("WhatsApp confirmation: no wa_id for identity", whatsappIdentityId);
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
    console.error("WhatsApp confirmation failed", sent.error);
  }
}

export async function notifyWhatsAppWaitlistPromoted(waId: string): Promise<void> {
  await sendWhatsAppText(waId, `ShuttleBook: ${PROMOTION_CONFIRMED_MESSAGE}`);
}
