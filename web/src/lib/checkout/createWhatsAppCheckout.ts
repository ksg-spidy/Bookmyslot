import { createServiceClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

export type WaCheckoutResult = { url: string } | { error: string };

export async function createWhatsAppCheckout(
  playSessionId: string,
  whatsappIdentityId: string
): Promise<WaCheckoutResult> {
  const admin = createServiceClient();
  const secret = process.env.STRIPE_SECRET_KEY;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !site) {
    return { error: "Server missing Stripe or site URL configuration." };
  }

  const { data: session, error: se } = await admin
    .from("play_sessions")
    .select("*")
    .eq("id", playSessionId)
    .single();

  if (se || !session) {
    return { error: "Session not found." };
  }
  if (session.status !== "open") {
    return { error: "Bookings are closed for this session." };
  }
  if (new Date(session.booking_closes_at) < new Date()) {
    return { error: "Booking deadline has passed." };
  }

  const { data: activeBooking } = await admin
    .from("bookings")
    .select("status")
    .eq("play_session_id", playSessionId)
    .eq("whatsapp_identity_id", whatsappIdentityId)
    .in("status", ["confirmed", "waitlist", "pending_payment"])
    .maybeSingle();

  if (activeBooking) {
    return { error: "You already have an active booking for this session." };
  }

  const stripe = new Stripe(secret);
  const currency = (process.env.STRIPE_CURRENCY ?? "aud").toLowerCase();

  try {
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: session.booking_fee_cents,
              product_data: {
                name: `ShuttleBook — ${session.title}`,
                description: session.venue,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          play_session_id: playSessionId,
          whatsapp_identity_id: whatsappIdentityId,
        },
        success_url: `${site}/api/whatsapp/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/browse?canceled=1`,
      },
      { idempotencyKey: `checkout-wa-${whatsappIdentityId}-${playSessionId}` }
    );

    if (!checkout.url) {
      return { error: "Could not start checkout." };
    }
    return { url: checkout.url };
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error ? e.message : "Checkout failed." };
  }
}
