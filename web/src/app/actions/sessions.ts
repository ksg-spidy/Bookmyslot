"use server";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { localDatetimeToIsoUtc } from "@/lib/datetime";
import { audInputToCents } from "@/lib/money";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const p = await getProfile();
  return p?.role === "admin";
}

export async function createPlaySession(formData: FormData) {
  if (!(await requireAdmin())) {
    return { error: "Unauthorized." };
  }
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "Saturday session");
  const venue = String(formData.get("venue") ?? "");
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");
  const bookingClosesAt = String(formData.get("booking_closes_at") ?? "");
  const maxPlayers = parseInt(String(formData.get("max_players") ?? "16"), 10);
  const bookingFeeCents =
    audInputToCents(String(formData.get("booking_fee_aud") ?? "")) ?? 1500;
  const withdrawalFeeCents =
    audInputToCents(String(formData.get("withdrawal_fee_aud") ?? "")) ?? 200;

  if (maxPlayers < 13 || maxPlayers > 16) {
    return { error: "Max players must be between 13 and 16." };
  }

  if (!venue || !startsAt || !endsAt || !bookingClosesAt) {
    return { error: "Fill in venue and all dates." };
  }

  const startsIso = localDatetimeToIsoUtc(startsAt);
  const endsIso = localDatetimeToIsoUtc(endsAt);
  const closesIso = localDatetimeToIsoUtc(bookingClosesAt);

  const { error } = await supabase.from("play_sessions").insert({
    title,
    venue,
    starts_at: startsIso,
    ends_at: endsIso,
    booking_closes_at: closesIso,
    max_players: maxPlayers,
    booking_fee_cents: bookingFeeCents,
    withdrawal_fee_cents: withdrawalFeeCents,
    status: "open",
  });

  if (error) {
    console.error(error);
    return { error: error.message };
  }
  revalidatePath("/admin");
  revalidatePath("/sessions");
  revalidatePath("/browse");
  return { ok: true };
}

export async function lockPlaySession(sessionId: string) {
  if (!(await requireAdmin())) {
    return { error: "Unauthorized." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("play_sessions")
    .update({ status: "locked" })
    .eq("id", sessionId);

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/admin");
  revalidatePath("/sessions");
  revalidatePath("/browse");
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/browse/${sessionId}`);
  return { ok: true };
}

export async function lockPlaySessionForm(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await lockPlaySession(id);
}
