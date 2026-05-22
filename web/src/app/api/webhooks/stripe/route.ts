import { fulfillBookingFromCheckoutSession } from "@/lib/checkout/fulfillBooking";
import { createServiceClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !whSecret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const stripe = new Stripe(secret);
  const raw = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (err) {
    console.error("Webhook signature failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const admin = createServiceClient();
    const result = await fulfillBookingFromCheckoutSession(admin, session);
    if (!result.ok) {
      console.error("Booking fulfillment failed", session.id, result.reason);
    }
  }

  return NextResponse.json({ received: true });
}
