# WhatsApp build kickoff

**Status:** Implemented in `web/` (API route, libs, Stripe branch, migration file). Run `npm run build` in `web/` before deploy; apply SQL migration in Supabase (see §1).

The sections below remain as a **reference** for copy-paste recovery; live sources are under `web/src/…` and `web/supabase/migrations/002_whatsapp.sql`.

## 1. `web/supabase/migrations/002_whatsapp.sql`

```sql
-- WhatsApp identities + booking path without web auth user

create table public.whatsapp_identities (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique,
  profile_id uuid references public.profiles (id) on delete set null,
  display_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index whatsapp_identities_profile_id_idx on public.whatsapp_identities (profile_id);

alter table public.whatsapp_identities enable row level security;

create table public.whatsapp_processed_messages (
  wa_message_id text primary key,
  processed_at timestamptz default now()
);

alter table public.whatsapp_processed_messages enable row level security;

alter table public.bookings alter column user_id drop not null;

alter table public.bookings
  add column whatsapp_identity_id uuid references public.whatsapp_identities (id) on delete cascade;

alter table public.bookings
  add constraint bookings_user_xor_wa check (
    (user_id is not null and whatsapp_identity_id is null)
    or (user_id is null and whatsapp_identity_id is not null)
  );

alter table public.bookings drop constraint if exists bookings_play_session_id_user_id_key;

create unique index bookings_play_session_user_unique
  on public.bookings (play_session_id, user_id)
  where user_id is not null;

create unique index bookings_play_session_wa_unique
  on public.bookings (play_session_id, whatsapp_identity_id)
  where whatsapp_identity_id is not null;
```

Run this in Supabase SQL Editor after backup.

## 2. Env (`web/.env.local.example` additions)

```
WHATSAPP_VERIFY_TOKEN=choose-a-random-string
WHATSAPP_APP_SECRET=from Meta App > WhatsApp > App Secret
WHATSAPP_ACCESS_TOKEN=from Meta temporary or system user token
WHATSAPP_PHONE_NUMBER_ID=from Meta WhatsApp API phone number id
WHATSAPP_DEFAULT_PLAY_SESSION_ID=optional uuid — if set, BOOK uses this session; else first open session
```

Webhook URL (Netlify): `https://YOUR_DOMAIN/api/webhooks/whatsapp`

## 3. `web/src/lib/whatsapp/verifySignature.ts`

```ts
import { createHmac, timingSafeEqual } from "crypto";

/** Meta WhatsApp Cloud API — X-Hub-Signature-256 */
export function verifyMetaSignature(
  rawBody: string,
  appSecret: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(signatureHeader, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
```

## 4. `web/src/lib/whatsapp/sendText.ts`

```ts
export async function sendWhatsAppText(toWaId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return { ok: false, error: "WhatsApp not configured" };
  }
  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toWaId,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("WhatsApp send failed", res.status, t);
    return { ok: false, error: t };
  }
  return { ok: true };
}
```

## 5. `web/src/lib/checkout/createWhatsAppCheckout.ts`

```ts
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

  const { data: existing } = await admin
    .from("bookings")
    .select("status")
    .eq("play_session_id", playSessionId)
    .eq("whatsapp_identity_id", whatsappIdentityId)
    .maybeSingle();

  if (
    existing &&
    (existing.status === "confirmed" ||
      existing.status === "waitlist" ||
      existing.status === "pending_payment")
  ) {
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
        success_url: `${site}/sessions/${playSessionId}?paid=1&from=wa`,
        cancel_url: `${site}/sessions/${playSessionId}?canceled=1&from=wa`,
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
```

## 6. `web/src/lib/whatsapp/processInbound.ts`

```ts
import { createServiceClient } from "@/lib/supabase/admin";
import { createWhatsAppCheckout } from "@/lib/checkout/createWhatsAppCheckout";
import { sendWhatsAppText } from "@/lib/whatsapp/sendText";

export type WhatsAppInboundMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
};

function normalizeCommand(body: string): string {
  return body.trim().toUpperCase();
}

async function resolveDefaultPlaySessionId(admin: ReturnType<typeof createServiceClient>): Promise<string | null> {
  const envId = process.env.WHATSAPP_DEFAULT_PLAY_SESSION_ID?.trim();
  if (envId) {
    const { data } = await admin.from("play_sessions").select("id").eq("id", envId).eq("status", "open").maybeSingle();
    if (data?.id) return data.id;
  }
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("play_sessions")
    .select("id")
    .eq("status", "open")
    .gte("booking_closes_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function processInboundWhatsAppMessage(msg: WhatsAppInboundMessage, contactName?: string): Promise<void> {
  const admin = createServiceClient();

  const { data: inserted, error: dedupeErr } = await admin
    .from("whatsapp_processed_messages")
    .insert({ wa_message_id: msg.id })
    .select("wa_message_id")
    .maybeSingle();

  if (dedupeErr) {
    const code = (dedupeErr as { code?: string }).code;
    if (code === "23505") {
      return;
    }
    console.error("Dedupe insert failed", dedupeErr);
    return;
  }
  if (!inserted) {
    return;
  }

  const waId = msg.from;
  const { data: identity, error: idErr } = await admin
    .from("whatsapp_identities")
    .upsert(
      { wa_id: waId, display_name: contactName ?? null, updated_at: new Date().toISOString() },
      { onConflict: "wa_id" }
    )
    .select("id")
    .single();

  if (idErr || !identity?.id) {
    console.error("whatsapp identity upsert failed", idErr);
    return;
  }

  const identityId = identity.id as string;

  if (msg.type !== "text" || !msg.text?.body) {
    await sendWhatsAppText(waId, "ShuttleBook: please send a text message. Reply HELP for commands.");
    return;
  }

  const cmd = normalizeCommand(msg.text.body);

  if (cmd === "HELP" || cmd === "HI" || cmd === "HELLO") {
    await sendWhatsAppText(
      waId,
      "ShuttleBook\n\nCommands:\n• BOOK — pay & book the next open session\n• STATUS — booking deadline for default session\n\nYou will receive a secure Stripe link to complete payment."
    );
    return;
  }

  if (cmd === "BOOK") {
    const playSessionId = await resolveDefaultPlaySessionId(admin);
    if (!playSessionId) {
      await sendWhatsAppText(waId, "No open session is available to book right now. Try again later.");
      return;
    }
    const res = await createWhatsAppCheckout(playSessionId, identityId);
    if ("error" in res) {
      await sendWhatsAppText(waId, `Could not start checkout: ${res.error}`);
      return;
    }
    await sendWhatsAppText(waId, `Open this link to pay and confirm your spot:\n${res.url}`);
    return;
  }

  if (cmd === "STATUS") {
    const playSessionId = await resolveDefaultPlaySessionId(admin);
    if (!playSessionId) {
      await sendWhatsAppText(waId, "No default open session.");
      return;
    }
    const { data: s } = await admin
      .from("play_sessions")
      .select("title, venue, booking_closes_at, starts_at, ends_at")
      .eq("id", playSessionId)
      .single();
    if (!s) {
      await sendWhatsAppText(waId, "Session not found.");
      return;
    }
    await sendWhatsAppText(
      waId,
      `${s.title}\n${s.venue}\nStarts: ${s.starts_at}\nBooking closes: ${s.booking_closes_at}\n\nReply BOOK to get a payment link.`
    );
    return;
  }

  await sendWhatsAppText(waId, "Unknown command. Reply HELP or BOOK.");
}
```

## 7. `web/src/app/api/webhooks/whatsapp/route.ts`

```ts
import { verifyMetaSignature } from "@/lib/whatsapp/verifySignature";
import { processInboundWhatsAppMessage, type WhatsAppInboundMessage } from "@/lib/whatsapp/processInbound";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const raw = await request.text();
  const sig = request.headers.get("x-hub-signature-256");
  if (!appSecret || !verifyMetaSignature(raw, appSecret, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
          messages?: WhatsAppInboundMessage[];
        };
      }>;
    }>;
  };

  const entries = b.entry ?? [];
  for (const ent of entries) {
    for (const ch of ent.changes ?? []) {
      const val = ch.value;
      const messages = val?.messages;
      if (!messages?.length) continue;
      const contactName = val?.contacts?.[0]?.profile?.name;
      for (const msg of messages) {
        await processInboundWhatsAppMessage(msg, contactName);
      }
    }
  }

  return NextResponse.json({ received: true });
}
```

## 8. Replace `web/src/app/api/webhooks/stripe/route.ts` with:

```ts
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
    const playSessionId = session.metadata?.play_session_id;
    const userId = session.metadata?.user_id ?? null;
    const whatsappIdentityId = session.metadata?.whatsapp_identity_id ?? null;
    const checkoutSessionId = session.id;
    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

    if (!playSessionId || !(userId || whatsappIdentityId) || !checkoutSessionId) {
      console.error("Missing metadata on checkout session", session.id);
      return NextResponse.json({ received: true });
    }

    const admin = createServiceClient();

    const { data: playSession, error: pErr } = await admin
      .from("play_sessions")
      .select("id, max_players, status")
      .eq("id", playSessionId)
      .single();

    if (pErr || !playSession || playSession.status !== "open") {
      console.error("play_session invalid", playSessionId, pErr);
      return NextResponse.json({ received: true });
    }

    const { data: existing } = await admin
      .from("bookings")
      .select("id, status")
      .eq("stripe_checkout_session_id", checkoutSessionId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ received: true });
    }

    const dup = userId
      ? await admin
          .from("bookings")
          .select("id")
          .eq("play_session_id", playSessionId)
          .eq("user_id", userId)
          .maybeSingle()
      : await admin
          .from("bookings")
          .select("id")
          .eq("play_session_id", playSessionId)
          .eq("whatsapp_identity_id", whatsappIdentityId)
          .maybeSingle();

    if (dup.data?.id) {
      return NextResponse.json({ received: true });
    }

    const { count: confirmedCount, error: cErr } = await admin
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("play_session_id", playSessionId)
      .eq("status", "confirmed");

    if (cErr) {
      console.error(cErr);
      return NextResponse.json({ received: true });
    }

    const confirmed = confirmedCount ?? 0;
    const max = playSession.max_players;

    let status: "confirmed" | "waitlist" = "waitlist";
    let waitlistPosition: number | null = null;

    if (confirmed < max) {
      status = "confirmed";
    } else {
      const { data: wl } = await admin
        .from("bookings")
        .select("waitlist_position")
        .eq("play_session_id", playSessionId)
        .eq("status", "waitlist")
        .order("waitlist_position", { ascending: false })
        .limit(1);

      const nextPos = (wl?.[0]?.waitlist_position ?? 0) + 1;
      waitlistPosition = nextPos;
    }

    const { error: insErr } = await admin.from("bookings").insert({
      play_session_id: playSessionId,
      user_id: userId,
      whatsapp_identity_id: whatsappIdentityId,
      status,
      stripe_checkout_session_id: checkoutSessionId,
      stripe_payment_intent_id: paymentIntentId ?? null,
      waitlist_position: waitlistPosition,
    });

    if (insErr) {
      console.error("Booking insert failed", insErr);
    }
  }

  return NextResponse.json({ received: true });
}
```

## 9. Netlify / Meta

- In Meta Developer Console, set Callback URL to `https://<your-site>/api/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`.
- Deploy `web/` with existing `netlify.toml` + `@netlify/plugin-nextjs`.
