import type { createServiceClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createServiceClient>;

/**
 * Returns true if this message should be processed (first time seen).
 * Returns false if Meta retried a message we already handled.
 */
export async function claimWhatsAppMessage(admin: Admin, waMessageId: string): Promise<boolean> {
  const id = waMessageId.trim();
  if (!id) return true;

  const { error } = await admin.from("whatsapp_processed_messages").insert({
    wa_message_id: id,
  });

  if (!error) return true;
  if (error.code === "23505") return false;

  console.error("whatsapp message dedup insert", error);
  return true;
}
