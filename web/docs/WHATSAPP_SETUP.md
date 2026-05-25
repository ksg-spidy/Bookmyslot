# WhatsApp Cloud API — Meta Developer setup for ShuttleBook

This guide wires **Meta’s WhatsApp Cloud API** to ShuttleBook so players can **BOOK**, **STATUS**, **ROSTER**, **WITHDRAW**, and **LINK** via chat.

**Production webhook URL:** `https://bookbadmintonslot.netlify.app/api/webhooks/whatsapp`  
**Local dev:** use a tunnel (ngrok, Cloudflare Tunnel) to the same path on port 3000.

---

## What you need before you start

- A [Meta](https://www.facebook.com/) account (personal is fine to start).
- A [**Meta Business Portfolio**](https://business.facebook.com/) (create one if prompted).
- ShuttleBook already on Netlify with **Stripe** and **Supabase** working for web bookings.
- Supabase migrations **001 → 005** applied (at minimum **002** and **003** for WhatsApp).

---

## Part 1 — Create the Meta app

1. Open **[Meta for Developers](https://developers.facebook.com/)** and log in.
2. **My Apps** → **Create App**.
3. Choose a use case that allows **WhatsApp** (often **Other** → **Business**, or **Connect with customers through WhatsApp** if shown).
4. App name, e.g. `ShuttleBook`, contact email → **Create app**.
5. If asked to link a **Business portfolio**, select or create one.

---

## Part 2 — Add the WhatsApp product

1. In the app dashboard, find **Add products** (or **Use cases**).
2. Add **WhatsApp** → **Set up** (or **Get started**).
3. Open **WhatsApp** in the left sidebar → **API Setup** (Meta sometimes labels this **Getting started**).

You should see:

| Field | What it is |
|--------|------------|
| **Temporary access token** | Short-lived token for quick tests (~24 hours). |
| **Phone number ID** | API ID of the sending number (not the phone digits). |
| **WhatsApp Business Account ID** | WABA ID (useful for support; ShuttleBook reads **Phone number ID**). |
| **Test number** | A Meta test recipient (add your personal WhatsApp in the test list). |

4. Under **Send and receive messages**, note the **From** phone number ID and add your phone as a **test recipient** so you can message the business number during development.

---

## Part 3 — Credentials for ShuttleBook

### 3a. `WHATSAPP_PHONE_NUMBER_ID`

On **WhatsApp → API Setup**, copy **Phone number ID** (numeric string).  
→ Netlify: `WHATSAPP_PHONE_NUMBER_ID=...`

### 3b. `WHATSAPP_ACCESS_TOKEN`

**Development (quick test):**

- Copy the **temporary** token from API Setup.
- Put it in Netlify / `.env.local` as `WHATSAPP_ACCESS_TOKEN`.
- Renew before it expires, or create a permanent token (below).

**Production (recommended):**

1. **[Business Settings](https://business.facebook.com/settings)** → **Users** → **System users** → **Add**.
2. Create a system user (e.g. `shuttlebook-api`), assign **Admin** access to your business assets.
3. **Generate new token** → select your **ShuttleBook** app.
4. Permissions: at minimum **`whatsapp_business_messaging`** (and **`whatsapp_business_management`** if you manage numbers via API).
5. Copy the token once — store in Netlify as `WHATSAPP_ACCESS_TOKEN` (never commit to git).

### 3c. `WHATSAPP_APP_SECRET`

1. App dashboard → **App settings** → **Basic**.
2. Copy **App secret** (click **Show**).
3. Netlify: `WHATSAPP_APP_SECRET=...`  
   Used to verify webhook `POST` signatures (`x-hub-signature-256`).

### 3d. `WHATSAPP_VERIFY_TOKEN`

You invent this string (random, long). Example: `shuttlebook-wa-verify-8f3k2m`.

- Netlify: `WHATSAPP_VERIFY_TOKEN=your-random-string`
- You will paste the **same** value in Meta’s webhook configuration (Part 4).

### 3e. Optional: `WHATSAPP_DEFAULT_PLAY_SESSION_ID`

UUID of the `play_sessions` row players book when they send **BOOK** without picking a session.

- Find it in Supabase **Table Editor** or admin URL `/admin/sessions/[id]`.
- If unset, ShuttleBook uses the **earliest open** session (by `starts_at`).

---

## Part 4 — Configure the webhook in Meta

1. **WhatsApp** → **Configuration** (or **Webhooks** under WhatsApp).
2. **Callback URL:**

   ```
   https://bookbadmintonslot.netlify.app/api/webhooks/whatsapp
   ```

   For local dev:

   ```
   https://YOUR-TUNNEL.ngrok-free.app/api/webhooks/whatsapp
   ```

3. **Verify token:** same as `WHATSAPP_VERIFY_TOKEN` in Netlify.
4. Click **Verify and save**. Meta sends `GET` with `hub.mode=subscribe` — ShuttleBook must respond with the challenge (needs env vars deployed on that URL).
5. **Webhook fields** → **Subscribe** to **`messages`** (required).  
   `contacts` is optional (used for display names).

If verification fails:

- Confirm Netlify deploy is live and env vars are set.
- Token must match exactly (no extra spaces).
- URL must be HTTPS and publicly reachable.

---

## Part 5 — Environment variables (Netlify)

**Site configuration → Environment variables** (same names in `web/.env.local` for dev):

| Variable | Required | Example / notes |
|----------|----------|-----------------|
| `WHATSAPP_VERIFY_TOKEN` | Yes | Random string you chose |
| `WHATSAPP_APP_SECRET` | Yes | From App settings → Basic |
| `WHATSAPP_ACCESS_TOKEN` | Yes | System user or temporary token |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | From API Setup |
| `WHATSAPP_DEFAULT_PLAY_SESSION_ID` | No | UUID of default session |
| `NEXT_PUBLIC_SITE_URL` | Yes | `https://bookbadmintonslot.netlify.app` |
| `STRIPE_SECRET_KEY` | Yes | For BOOK checkout + WITHDRAW |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe → `checkout.session.completed` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Webhook + booking writes |

Redeploy after changing variables.

---

## Part 6 — Database (Supabase)

In **SQL Editor**, run migrations in order (if not already):

1. `web/supabase/migrations/001_initial.sql`
2. `web/supabase/migrations/002_whatsapp.sql`
3. `web/supabase/migrations/003_whatsapp_link_tokens.sql`
4. `web/supabase/migrations/004_booking_unique_active_only.sql`
5. `web/supabase/migrations/005_bookings_rebook_after_withdraw.sql`

Verify:

```sql
-- paste contents of web/supabase/ops/verify_whatsapp_schema.sql
```

All `ok` columns should be `true`.

---

## Part 7 — Stripe (required for BOOK)

WhatsApp **BOOK** creates a Stripe Checkout session; the booking row is created when Stripe fires the webhook.

1. Stripe **Developers → Webhooks** → endpoint  
   `https://bookbadmintonslot.netlify.app/api/webhooks/stripe`
2. Event: **`checkout.session.completed`**
3. Signing secret → `STRIPE_WEBHOOK_SECRET` on Netlify.

---

## Part 8 — Test end-to-end

1. From your **personal WhatsApp**, message the **business / test number** shown in Meta API Setup (not your own number as “from”).
2. Send: `HELP`  
   → You should get buttons or a command list.
3. Send: `STATUS`  
   → Session title, venue, times (if an open session exists).
4. Send: `BOOK`  
   → Reply with a **Stripe payment link**. Complete payment in test mode.
5. Check:
   - Stripe webhook delivery **2xx**
   - Supabase `bookings` row with `whatsapp_identity_id` set
   - WhatsApp confirmation message after payment

**Commands reference**

| Text / button | Action |
|---------------|--------|
| `HELP` | Menu |
| `BOOK` | Stripe link for default open session |
| `STATUS` | Session details |
| `ROSTER` | Who’s confirmed / waitlisted |
| `WITHDRAW` | Cancel with partial refund |
| `LINK` | Link WhatsApp to web login |

---

## Part 9 — Go live (real players, not just test numbers)

1. **Meta Business verification** — complete in Business Manager if required for your region.
2. **WhatsApp Business Account** — add and verify a **real phone number** (Business Platform → Phone numbers). Display name must follow [WhatsApp naming rules](https://developers.facebook.com/docs/whatsapp/guides/display-name).
3. Replace the **test** Phone number ID with the **production** number’s ID in `WHATSAPP_PHONE_NUMBER_ID` if it changes.
4. Use a **permanent** system user token (Part 3b), not the temporary API Setup token.
5. Remove test-only recipients: in production, any user who messages your business number can interact (subject to Meta messaging limits and opt-in policies).
6. Publish app / switch to **Live** mode in the app dashboard when Meta requires it for production messaging.

---

## Part 10 — Local development with a tunnel

1. `cd web` → `npm.cmd run dev` (port 3000).
2. Start ngrok: `ngrok http 3000`
3. Set Meta webhook callback to `https://xxxx.ngrok-free.app/api/webhooks/whatsapp`
4. Copy WhatsApp env vars into `web/.env.local`
5. Message the test number; watch terminal logs for webhook errors.

When done testing locally, **change the Meta callback URL back** to the Netlify production URL.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Webhook verify fails | Wrong `WHATSAPP_VERIFY_TOKEN`, or Netlify not deployed |
| No reply to messages | `messages` not subscribed; wrong `WHATSAPP_PHONE_NUMBER_ID`; expired token |
| `Invalid signature` on POST | Wrong `WHATSAPP_APP_SECRET` |
| BOOK says “not configured” | Missing `STRIPE_SECRET_KEY` or `NEXT_PUBLIC_SITE_URL` |
| Payment works, no booking | Stripe webhook missing or failing; check Netlify function logs |
| LINK fails | Migration **003** not applied |
| “No open session” | No `open` session in DB, or `booking_closes_at` in the past |

**Logs:** Netlify → **Functions** / **Deploy log** for `/api/webhooks/whatsapp` and `/api/webhooks/stripe`.

---

## Architecture (ShuttleBook)

```
Player WhatsApp
    → Meta Cloud API
    → POST /api/webhooks/whatsapp (verify signature, dedupe message)
    → processInbound.ts (BOOK / STATUS / …)
    → Stripe Checkout (metadata: whatsapp_identity_id)
    → POST /api/webhooks/stripe
    → fulfillBooking.ts → Supabase + optional WhatsApp confirmation text
```

Code entry points:

- `web/src/app/api/webhooks/whatsapp/route.ts`
- `web/src/lib/whatsapp/processInbound.ts`
- `web/src/lib/checkout/createWhatsAppCheckout.ts`
