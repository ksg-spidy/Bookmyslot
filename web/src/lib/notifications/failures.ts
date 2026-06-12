import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationFailureInput = {
  channel: "whatsapp" | "email";
  kind: string;
  recipient?: string;
  bookingId?: string | null;
  playSessionId?: string | null;
  error?: string;
};

/**
 * Persist a failed player notification so it surfaces on the admin dashboard
 * instead of dying in server logs. Never throws — a logging failure must not
 * break the calling money/booking path.
 */
export async function recordNotificationFailure(
  admin: SupabaseClient,
  input: NotificationFailureInput
): Promise<void> {
  const { error } = await admin.from("notification_failures").insert({
    channel: input.channel,
    kind: input.kind,
    recipient: input.recipient ?? null,
    booking_id: input.bookingId ?? null,
    play_session_id: input.playSessionId ?? null,
    error: input.error ?? null,
  });

  if (error) {
    console.error("recordNotificationFailure insert failed", input.kind, error);
  }
}
