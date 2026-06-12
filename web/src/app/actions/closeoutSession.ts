"use server";

import { closeOutSession } from "@/lib/bookings/closeout";
import { getProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";

export type CloseoutActionResult = { ok: boolean; message: string };

/** Admin-only: refund leftover paid waitlist players and mark the session closed out. */
export async function closeOutSessionAction(
  playSessionId: string
): Promise<CloseoutActionResult> {
  const profile = await getProfile();
  if (profile?.role !== "admin") {
    return { ok: false, message: "Unauthorized." };
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return { ok: false, message: "Server missing Stripe configuration." };
  }

  const admin = createServiceClient();
  const stripe = new Stripe(secret);

  const result = await closeOutSession({ admin, stripe, playSessionId });

  if (result.ok) {
    revalidatePath("/admin");
    revalidatePath(`/admin/sessions/${playSessionId}`);
  }

  return { ok: result.ok, message: result.message };
}
