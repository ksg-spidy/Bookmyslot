import type { createServiceClient } from "@/lib/supabase/admin";
import {
  normalizeSessionCapacity,
  waitlistRemaining,
  type SessionCapacityConfig,
} from "@/lib/bookings/capacity";

type Admin = ReturnType<typeof createServiceClient>;

export type SessionBookingCounts = {
  confirmed: number;
  waitlist: number;
  spotsRemaining: number;
  waitlistCapacity: number;
  waitlistRemaining: number;
};

export async function getConfirmedCount(
  admin: Admin,
  playSessionId: string
): Promise<number> {
  const { count, error } = await admin
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("play_session_id", playSessionId)
    .eq("status", "confirmed");

  if (error) {
    console.error("confirmed count", error);
    return 0;
  }
  return count ?? 0;
}

export async function getSessionBookingCounts(
  admin: Admin,
  playSessionId: string,
  capacityConfig: SessionCapacityConfig | number
): Promise<SessionBookingCounts> {
  const capacity =
    typeof capacityConfig === "number"
      ? normalizeSessionCapacity({ max_players: capacityConfig })
      : normalizeSessionCapacity(capacityConfig);
  const [{ count: confirmed }, { count: waitlist }] = await Promise.all([
    admin
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("play_session_id", playSessionId)
      .eq("status", "confirmed"),
    admin
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("play_session_id", playSessionId)
      .eq("status", "waitlist"),
  ]);

  const confirmedN = confirmed ?? 0;
  const waitlistN = waitlist ?? 0;

  return {
    confirmed: confirmedN,
    waitlist: waitlistN,
    spotsRemaining: Math.max(0, capacity.maxPlayers - confirmedN),
    waitlistCapacity: capacity.waitlistCapacity,
    waitlistRemaining: waitlistRemaining(capacity.waitlistCapacity, waitlistN),
  };
}

export async function getBookingCountsForSessions(
  admin: Admin,
  sessions: ({ id: string } & SessionCapacityConfig)[]
): Promise<Map<string, SessionBookingCounts>> {
  const map = new Map<string, SessionBookingCounts>();
  if (!sessions.length) return map;

  const ids = sessions.map((s) => s.id);
  const { data: rows, error } = await admin
    .from("bookings")
    .select("play_session_id, status")
    .in("play_session_id", ids)
    .in("status", ["confirmed", "waitlist"]);

  if (error) {
    console.error("batch booking counts", error);
    for (const s of sessions) {
      const capacity = normalizeSessionCapacity(s);
      map.set(s.id, {
        confirmed: 0,
        waitlist: 0,
        spotsRemaining: capacity.maxPlayers,
        waitlistCapacity: capacity.waitlistCapacity,
        waitlistRemaining: capacity.waitlistCapacity,
      });
    }
    return map;
  }

  const confirmedBySession = new Map<string, number>();
  const waitlistBySession = new Map<string, number>();

  for (const row of rows ?? []) {
    const sid = row.play_session_id as string;
    if (row.status === "confirmed") {
      confirmedBySession.set(sid, (confirmedBySession.get(sid) ?? 0) + 1);
    } else if (row.status === "waitlist") {
      waitlistBySession.set(sid, (waitlistBySession.get(sid) ?? 0) + 1);
    }
  }

  for (const s of sessions) {
    const capacity = normalizeSessionCapacity(s);
    const confirmed = confirmedBySession.get(s.id) ?? 0;
    const waitlist = waitlistBySession.get(s.id) ?? 0;
    map.set(s.id, {
      confirmed,
      waitlist,
      spotsRemaining: Math.max(0, capacity.maxPlayers - confirmed),
      waitlistCapacity: capacity.waitlistCapacity,
      waitlistRemaining: waitlistRemaining(capacity.waitlistCapacity, waitlist),
    });
  }

  return map;
}
