import type { SupabaseClient } from "@supabase/supabase-js";

export type OpenPlaySession = {
  id: string;
  title: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  booking_closes_at: string;
  max_players: number;
  status: string;
  booking_fee_cents: number;
  withdrawal_fee_cents: number;
};

export async function fetchOpenPlaySessions(
  client: SupabaseClient
): Promise<{ rows: OpenPlaySession[] | null; error: string | null }> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("play_sessions")
    .select(
      "id, title, venue, starts_at, ends_at, booking_closes_at, max_players, status, booking_fee_cents, withdrawal_fee_cents"
    )
    .eq("status", "open")
    .gt("booking_closes_at", now)
    .order("starts_at", { ascending: true });

  if (error) {
    return { rows: null, error: error.message };
  }
  return { rows: (data ?? []) as OpenPlaySession[], error: null };
}
