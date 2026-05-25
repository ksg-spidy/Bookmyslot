import { fulfillBookingFromCheckoutSession } from "@/lib/checkout/fulfillBooking";
import { createServiceClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

/**
 * Stripe success_url for WhatsApp checkout — fulfills booking and triggers WA confirmation
 * even if the Stripe webhook is delayed (player returns from browser after paying).
 */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return htmlResponse("Missing payment session.", false);
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || secret.includes("...")) {
    return htmlResponse("Payments are not configured.", false);
  }

  const stripe = new Stripe(secret);
  let checkout: Stripe.Checkout.Session;
  try {
    checkout = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    console.error("payment-success retrieve", e);
    return htmlResponse("Could not verify payment.", false);
  }

  if (checkout.payment_status !== "paid" && checkout.status !== "complete") {
    return htmlResponse("Payment not completed yet. Return to WhatsApp and try again in a moment.", false);
  }

  try {
    const admin = createServiceClient();
    const result = await fulfillBookingFromCheckoutSession(admin, checkout);
    if (!result.ok) {
      console.error("payment-success fulfill", sessionId, result.reason);
      return htmlResponse(
        `Payment received but booking could not be saved (${result.reason}). Contact the organiser with your receipt.`,
        false
      );
    }
  } catch (e) {
    console.error("payment-success error", e);
    return htmlResponse("Payment received but something went wrong. Check WhatsApp for confirmation.", false);
  }

  return htmlResponse(
    "Payment successful. Check WhatsApp for your booking confirmation — you can close this page.",
    true
  );
}

function htmlResponse(message: string, ok: boolean) {
  const color = ok ? "#3fb950" : "#f85149";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>ShuttleBook</title></head><body style="font-family:system-ui;background:#0d1117;color:#e6edf3;padding:2rem;max-width:28rem;margin:auto"><p style="color:${color}">${message}</p></body></html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 500,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
