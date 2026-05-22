"use server";

import { fulfillBookingFromCheckoutSession } from "@/lib/checkout/fulfillBooking";
import { getProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

export async function adminSyncBookingFromStripe(
  playSessionId: string,
  stripeCheckoutSessionId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getProfile();
  if (profile?.role !== "admin") {
    return { ok: false, error: "forbidden" };
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || secret.includes("...")) {
    return { ok: false, error: "stripe_not_configured" };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "supabase_service_role_missing" };
  }

  const checkoutId = stripeCheckoutSessionId.trim();
  if (!checkoutId.startsWith("cs_")) {
    return { ok: false, error: "invalid_checkout_session_id" };
  }

  const stripe = new Stripe(secret);
  const admin = createServiceClient();

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(checkoutId, {
      expand: ["payment_intent"],
    });
  } catch (e) {
    console.error("adminSyncBookingFromStripe retrieve", checkoutId, e);
    return { ok: false, error: "checkout_not_found" };
  }

  if (session.metadata?.play_session_id !== playSessionId) {
    return { ok: false, error: "checkout_session_wrong_play_session" };
  }

  const result = await fulfillBookingFromCheckoutSession(admin, session);
  if (!result.ok) {
    console.error("adminSyncBookingFromStripe", checkoutId, result.reason);
    return { ok: false, error: result.reason };
  }
  return { ok: true };
}
