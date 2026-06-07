"use server";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import {
  DEFAULT_BOOKING_CODE_COUNT,
  DEFAULT_PLAYERS_PER_BOOKING_CODE,
  DEFAULT_WAITLIST_PER_BOOKING_CODE,
  parseCapacityField,
} from "@/lib/bookings/capacity";
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
  const bookingCodeCount = parseCapacityField(
    formData.get("booking_code_count"),
    DEFAULT_BOOKING_CODE_COUNT
  );
  const playersPerBookingCode = parseCapacityField(
    formData.get("players_per_booking_code"),
    DEFAULT_PLAYERS_PER_BOOKING_CODE
  );
  const waitlistPerBookingCode = parseCapacityField(
    formData.get("waitlist_per_booking_code"),
    DEFAULT_WAITLIST_PER_BOOKING_CODE
  );
  const maxPlayers = bookingCodeCount * playersPerBookingCode;
  const bookingFeeCents =
    audInputToCents(String(formData.get("booking_fee_aud") ?? "")) ?? 1500;
  const withdrawalFeeCents =
    audInputToCents(String(formData.get("withdrawal_fee_aud") ?? "")) ?? 200;

  if (bookingCodeCount < 1 || bookingCodeCount > 50) {
    return { error: "Booking codes must be between 1 and 50." };
  }

  if (playersPerBookingCode < 1 || playersPerBookingCode > 32) {
    return { error: "Players per booking code must be between 1 and 32." };
  }

  if (waitlistPerBookingCode < 0 || waitlistPerBookingCode > 32) {
    return { error: "Waitlist per booking code must be between 0 and 32." };
  }

  if (maxPlayers > 512) {
    return { error: "Total player capacity must be 512 or fewer." };
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
    booking_code_count: bookingCodeCount,
    players_per_booking_code: playersPerBookingCode,
    waitlist_per_booking_code: waitlistPerBookingCode,
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

export async function unlockPlaySession(sessionId: string) {
  if (!(await requireAdmin())) {
    return { error: "Unauthorized." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("play_sessions")
    .update({ status: "open" })
    .eq("id", sessionId)
    .eq("status", "locked");

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

export async function unlockPlaySessionForm(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await unlockPlaySession(id);
}
