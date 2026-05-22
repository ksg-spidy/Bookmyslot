"use server";

import { fulfillBookingFromCheckoutSession } from "@/lib/checkout/fulfillBooking";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";

const RETRIEVE_ATTEMPTS = 5;
const RETRIEVE_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncBookingAfterPayment(
  playSessionId: string,
  stripeCheckoutSessionId?: string
): Promise<{ synced: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { synced: false, error: "not_signed_in" };
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret || secret.includes("...")) {
      return { synced: false, error: "stripe_not_configured" };
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { synced: false, error: "supabase_service_role_missing" };
    }

    const checkoutId = stripeCheckoutSessionId?.trim();
    if (!checkoutId) {
      return { synced: false, error: "missing_checkout_session_id" };
    }

    const stripe = new Stripe(secret);
    const admin = createServiceClient();

    let session: Stripe.Checkout.Session | null = null;
    for (let attempt = 0; attempt < RETRIEVE_ATTEMPTS; attempt++) {
      const retrieved = await stripe.checkout.sessions.retrieve(checkoutId, {
        expand: ["payment_intent"],
      });
      if (
        retrieved.metadata?.play_session_id === playSessionId &&
        retrieved.metadata?.user_id === user.id &&
        (retrieved.payment_status === "paid" || retrieved.status === "complete")
      ) {
        session = retrieved;
        break;
      }
      if (attempt < RETRIEVE_ATTEMPTS - 1) {
        await sleep(RETRIEVE_DELAY_MS);
      }
    }

    if (!session) {
      return { synced: false, error: "checkout_not_ready" };
    }

    const result = await fulfillBookingFromCheckoutSession(admin, session);
    if (!result.ok) {
      console.error("syncBookingAfterPayment", checkoutId, result.reason);
      return { synced: false, error: result.reason };
    }
    return { synced: true };
  } catch (e) {
    console.error("syncBookingAfterPayment", e);
    return {
      synced: false,
      error: e instanceof Error ? e.message : "sync_failed",
    };
  }
}
