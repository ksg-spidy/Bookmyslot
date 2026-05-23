"use server";

import { getActiveBookingForUser } from "@/lib/bookings/queries";
import { getProfile } from "@/lib/auth";
import { isProfileComplete } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";

export async function startCheckout(playSessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

  const { data: session, error: se } = await supabase
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

  const activeBooking = await getActiveBookingForUser(supabase, playSessionId, user.id);

  if (activeBooking) {
    return { error: "You already have an active booking for this session." };
  }

  const profile = await getProfile();
  if (!isProfileComplete(profile)) {
    return {
      error: "Add your name and phone in Profile settings before booking.",
    };
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !site) {
    return { error: "Server missing Stripe or site URL configuration." };
  }

  const stripe = new Stripe(secret);
  const currency = (process.env.STRIPE_CURRENCY ?? "aud").toLowerCase();

  try {
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: user.email ?? undefined,
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
          user_id: user.id,
        },
        success_url: `${site}/sessions/${playSessionId}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/sessions/${playSessionId}?canceled=1`,
      },
      { idempotencyKey: `checkout-${user.id}-${playSessionId}` }
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
