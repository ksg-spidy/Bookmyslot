"use server";

import { getProfile } from "@/lib/auth";
import { withdrawBooking } from "@/lib/bookings/withdraw";
import { createServiceClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";

export type AdminWithdrawBookingResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function adminWithdrawBooking(
  playSessionId: string,
  bookingId: string
): Promise<AdminWithdrawBookingResult> {
  const profile = await getProfile();
  if (profile?.role !== "admin") {
    return { ok: false, message: "Only admins can withdraw player bookings." };
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return { ok: false, message: "Server missing Stripe configuration." };
  }

  const admin = createServiceClient();
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, play_session_id, status, user_id, whatsapp_identity_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !booking) {
    return { ok: false, message: "Booking not found." };
  }

  if (booking.play_session_id !== playSessionId) {
    return { ok: false, message: "Booking does not belong to this session." };
  }

  if (booking.status !== "confirmed" && booking.status !== "waitlist") {
    return { ok: false, message: "Only confirmed or waitlisted bookings can be withdrawn." };
  }

  const stripe = new Stripe(secret);
  const result = await withdrawBooking({
    admin,
    stripe,
    playSessionId,
    userId: (booking.user_id as string | null) ?? undefined,
    whatsappIdentityId: (booking.whatsapp_identity_id as string | null) ?? undefined,
    allowLockedSession: true,
  });

  if (result.ok) {
    revalidatePath("/admin");
    revalidatePath(`/admin/sessions/${playSessionId}`);
    revalidatePath("/sessions");
    revalidatePath(`/sessions/${playSessionId}`);
    revalidatePath("/sessions/bookings");
    revalidatePath("/browse");
    revalidatePath(`/browse/${playSessionId}`);
  }

  return result;
}
