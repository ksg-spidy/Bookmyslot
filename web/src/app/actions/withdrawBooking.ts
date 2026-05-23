"use server";

import { withdrawBooking } from "@/lib/bookings/withdraw";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";

export async function withdrawPlayerBooking(playSessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, message: "You must be signed in." };
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return { ok: false as const, message: "Server missing Stripe configuration." };
  }

  const admin = createServiceClient();
  const stripe = new Stripe(secret);
  const result = await withdrawBooking({
    admin,
    stripe,
    playSessionId,
    userId: user.id,
  });

  if (result.ok) {
    revalidatePath("/sessions");
    revalidatePath(`/sessions/${playSessionId}`);
    revalidatePath("/sessions/bookings");
    revalidatePath("/browse");
    revalidatePath(`/browse/${playSessionId}`);
  }

  return result;
}
