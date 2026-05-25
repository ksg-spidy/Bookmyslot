import type { SupabaseClient } from "@supabase/supabase-js";
import { formatSessionRange } from "@/lib/datetime";
import { sendWhatsAppText } from "@/lib/whatsapp/sendText";

export async function notifyWhatsAppBookingConfirmation(opts: {
  admin: SupabaseClient;
  whatsappIdentityId: string;
  playSession: {
    title: string;
    venue: string;
    starts_at: string;
    ends_at: string;
  };
  status: "confirmed" | "waitlist";
}): Promise<void> {
  const { admin, whatsappIdentityId, playSession, status } = opts;

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

  const title = playSession.title ?? "Session";
  const venue = playSession.venue ?? "";
  const when = formatSessionRange(playSession.starts_at, playSession.ends_at);

  const body =
    status === "confirmed"
      ? `ShuttleBook: you are confirmed for ${title}.\n${venue}\n${when}\nPayment received — see you on court.`
      : `ShuttleBook: you are on the waitlist for ${title} (${venue}).\n${when}\nPayment received — we will notify you if a spot opens.`;

  const sent = await sendWhatsAppText(to, body);
  if (!sent.ok) {
    console.error("WhatsApp confirmation failed", sent.error);
  }
}
