import { closeOutDueSessions } from "@/lib/bookings/closeout";
import { getCronSecret } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import Stripe from "stripe";

/**
 * Hourly sweep (Netlify scheduled function): refund unpromoted paid waitlist
 * players in full for every session that has started, then stamp closed_out_at.
 * Guarded by `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function POST(request: Request) {
  const secret = getCronSecret();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const admin = createServiceClient();
  const stripe = new Stripe(stripeSecret);

  const result = await closeOutDueSessions({ admin, stripe });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
