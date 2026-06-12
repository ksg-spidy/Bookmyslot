import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;

  const profile = await getProfile();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: session, error: se } = await supabase
    .from("play_sessions")
    .select("title")
    .eq("id", sessionId)
    .single();

  if (se || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data: bookings, error: be } = await supabase
    .from("bookings")
    .select("id, status, waitlist_position, created_at, user_id")
    .eq("play_session_id", sessionId)
    .order("created_at", { ascending: true });

  if (be) {
    return NextResponse.json({ error: be.message }, { status: 500 });
  }

  const userIds = [...new Set((bookings ?? []).map((b) => b.user_id))];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, phone").in("id", userIds);
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Per-booking money from the ledger (RLS: admins can read payment_events).
  const { data: events } = await supabase
    .from("payment_events")
    .select("booking_id, type, amount_cents")
    .eq("play_session_id", sessionId);

  const paidByBooking = new Map<string, number>();
  const refundedByBooking = new Map<string, number>();
  for (const e of events ?? []) {
    if (!e.booking_id) continue;
    const map = e.type === "refund" ? refundedByBooking : paidByBooking;
    map.set(e.booking_id, (map.get(e.booking_id) ?? 0) + e.amount_cents);
  }

  const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [
    [
      "full_name",
      "phone",
      "status",
      "waitlist_position",
      "paid_cents",
      "refunded_cents",
      "created_at",
      "user_id",
    ].join(","),
  ];

  for (const b of bookings ?? []) {
    const p = pmap.get(b.user_id);
    lines.push(
      [
        escape(p?.full_name ?? ""),
        escape(p?.phone ?? ""),
        escape(b.status),
        b.waitlist_position ?? "",
        paidByBooking.get(b.id) ?? 0,
        refundedByBooking.get(b.id) ?? 0,
        escape(new Date(b.created_at).toISOString()),
        escape(b.user_id),
      ].join(",")
    );
  }

  const csv = lines.join("\n");
  const safeTitle = String(session.title).replace(/[^\w\-]+/g, "_").slice(0, 40);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shuttlebook-${safeTitle}-${sessionId.slice(0, 8)}.csv"`,
    },
  });
}
