import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVE_BOOKING_STATUSES = ["confirmed", "waitlist", "pending_payment"] as const;

export type ActiveBooking = {
  id: string;
  status: string;
  waitlist_position: number | null;
  promoted_at: string | null;
};

export async function getActiveBookingForUser(
  supabase: SupabaseClient,
  playSessionId: string,
  userId: string
): Promise<ActiveBooking | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, waitlist_position, promoted_at")
    .eq("play_session_id", playSessionId)
    .eq("user_id", userId)
    .in("status", [...ACTIVE_BOOKING_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getActiveBookingForUser", error);
    return null;
  }
  return data;
}
