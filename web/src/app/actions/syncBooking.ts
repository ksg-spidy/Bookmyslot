"use server";

import { fulfillBookingFromCheckoutSession } from "@/lib/checkout/fulfillBooking";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";

export async function syncBookingAfterPayment(
  playSessionId: string,
  stripeCheckoutSessionId?: string
): Promise<{ synced: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { synced: false };
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return { synced: false };
  }

  const stripe = new Stripe(secret);
  const admin = createServiceClient();

  let checkoutId = stripeCheckoutSessionId?.trim();
  if (!checkoutId) {
    const listed = await stripe.checkout.sessions.list({
      limit: 20,
      status: "complete",
    });
    const match = listed.data.find(
      (s) =>
        s.metadata?.play_session_id === playSessionId &&
        s.metadata?.user_id === user.id &&
        s.payment_status === "paid"
    );
    checkoutId = match?.id;
  }

  if (!checkoutId) {
    return { synced: false };
  }

  const session = await stripe.checkout.sessions.retrieve(checkoutId);
  if (
    session.metadata?.play_session_id !== playSessionId ||
    session.metadata?.user_id !== user.id
  ) {
    return { synced: false };
  }

  const result = await fulfillBookingFromCheckoutSession(admin, session);
  return { synced: result.ok };
}
