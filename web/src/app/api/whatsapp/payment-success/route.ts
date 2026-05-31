import { fulfillBookingFromCheckoutSession } from "@/lib/checkout/fulfillBooking";
import { createServiceClient } from "@/lib/supabase/admin";
import { formatSessionRange } from "@/lib/datetime";
import { humanizeFulfillReason } from "@/lib/whatsapp/sessionCommands";
import { renderPaymentSuccessHtml } from "@/lib/whatsapp/paymentSuccessHtml";
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

  const playSessionId = checkout.metadata?.play_session_id?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";

  try {
    const admin = createServiceClient();
    const result = await fulfillBookingFromCheckoutSession(admin, checkout);
    if (!result.ok) {
      console.error("payment-success fulfill", sessionId, result.reason);
      return htmlResponse(
        `Payment received but booking could not be saved. ${humanizeFulfillReason(result.reason)}`,
        false
      );
    }

    let title: string | undefined;
    let venue: string | undefined;
    let when: string | undefined;
    let status: "confirmed" | "waitlist" | undefined;
    let waitlistPosition: number | null | undefined;

    if (playSessionId) {
      const { data: ps } = await admin
        .from("play_sessions")
        .select("title, venue, starts_at, ends_at")
        .eq("id", playSessionId)
        .maybeSingle();
      if (ps) {
        title = ps.title as string;
        venue = ps.venue as string;
        when = formatSessionRange(ps.starts_at as string, ps.ends_at as string);
      }

      const waIdentityId = checkout.metadata?.whatsapp_identity_id?.trim();
      if (waIdentityId) {
        const { data: booking } = await admin
          .from("bookings")
          .select("status, waitlist_position")
          .eq("stripe_checkout_session_id", sessionId)
          .maybeSingle();
        if (booking?.status === "confirmed" || booking?.status === "waitlist") {
          status = booking.status;
          waitlistPosition = booking.waitlist_position as number | null;
        }
      }
    }

    const calendarUrl =
      playSessionId && siteUrl ? `${siteUrl}/api/calendar/session/${playSessionId}` : undefined;

    return htmlResponse("Payment successful.", true, {
      title,
      venue,
      when,
      status,
      waitlistPosition,
      calendarUrl,
    });
  } catch (e) {
    console.error("payment-success error", e);
    return htmlResponse(
      "Payment received. Check WhatsApp for your booking confirmation — you can close this page.",
      true
    );
  }
}

function htmlResponse(
  message: string,
  ok: boolean,
  details?: {
    title?: string;
    venue?: string;
    when?: string;
    status?: "confirmed" | "waitlist";
    waitlistPosition?: number | null;
    calendarUrl?: string;
  }
) {
  const html = renderPaymentSuccessHtml({
    ok,
    message,
    ...details,
  });
  return new NextResponse(html, {
    status: ok ? 200 : 500,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
