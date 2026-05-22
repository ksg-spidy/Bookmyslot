# ShuttleBook — Agent handoff (from prior chat)

Use this as the system/context prompt when opening a **new agent window** on this repo.

---

## Project

**ShuttleBook** — Badminton session booking MVP.

- **Repo:** https://github.com/ksg-spidy/Bookmyslot.git
- **Local path:** `c:\Users\kumar\.cursor\projects\Badminton booking`
- **App directory:** `web/` (Next.js 15, Netlify base directory = `web`)
- **Production:** https://bookbadmintonslot.netlify.app
- **Supabase project:** `galtalsgxrbqapkfatky` (URL: `https://galtalsgxrbqapkfatky.supabase.co` — **no** `/rest/v1/` suffix)

---

## Stack

- Next.js 15 + Turbopack (`npm.cmd run dev` on Windows — PowerShell may block `npm.ps1`; use `npm.cmd` or `web/start-dev.bat`)
- Supabase (Postgres, magic-link auth for players, password auth for admins)
- Stripe Checkout + webhook `checkout.session.completed`
- Deploy: Netlify (`web/netlify.toml`, `@netlify/plugin-nextjs`)

---

## Auth model (implemented)

| Role | Login |
|------|--------|
| **Player** | `/login` — magic link (`signInWithOtp`), improved flow with `/auth/confirm` |
| **Admin** | `/admin/login` — email + password (`signInWithPassword`), must have `profiles.role = 'admin'` |

Admin routes live under `web/src/app/admin/(protected)/` so `/admin/login` is public. Unauthenticated admin → `/admin/login`.

**Supabase dashboard:** Enable Email + password; set admin user password; redirect URLs must include production + `http://localhost:3000/auth/callback`.

---

## Booking flow (critical)

1. Player: `/sessions` → `/sessions/[id]` → **Pay & book** → `startCheckout` (server action) → Stripe
2. Success URL: `{NEXT_PUBLIC_SITE_URL}/sessions/{id}?paid=1&session_id={CHECKOUT_SESSION_ID}`
3. Booking row created by:
   - Stripe webhook → `POST /api/webhooks/stripe` → `fulfillBookingFromCheckoutSession()` (service role), **or**
   - Client fallback → `syncBookingAfterPayment()` (requires `session_id` in URL)

**Key files:**
- `web/src/lib/checkout/fulfillBooking.ts`
- `web/src/app/actions/syncBooking.ts`
- `web/src/app/actions/checkout.ts`
- `web/src/app/sessions/[id]/YourBooking.tsx`
- `web/src/app/api/webhooks/stripe/route.ts`

**Recent fix (commit `1adccb2`):** Bookings were not appearing in admin after payment — DB had 0 rows; green “payment received” banner did not mean booking saved. Fixes: retry sync with checkout session id, webhook returns 500 on failure, admin bookings page uses service role, clearer UI + retry button.

---

## Database migrations (run in Supabase SQL Editor, in order)

1. `web/supabase/migrations/001_initial.sql`
2. `002_whatsapp.sql` (if using WhatsApp)
3. `004_booking_unique_active_only.sql`
4. **`005_bookings_rebook_after_withdraw.sql`** — drops old `bookings_play_session_id_user_id_key` so players can re-book after withdraw

Promote admin:
```sql
update public.profiles set role = 'admin' where id = 'USER-UUID';
```

---

## Environment variables

**Local:** `web/.env.local` (never commit)

**Netlify (required for bookings to work):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` = `https://bookbadmintonslot.netlify.app` (no trailing slash)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — **real test/live keys**, not `sk_test_...` placeholders
- Optional: `STRIPE_CURRENCY`, `BOOKING_TZ_OFFSET`

**Stripe webhook URL:** `https://bookbadmintonslot.netlify.app/api/webhooks/stripe` — event `checkout.session.completed`

---

## Git / deploy status

- **Branch:** `main`, remote `origin` via SSH (`git@github.com:ksg-spidy/Bookmyslot.git`)
- **Recent commits on main:**
  - `fe3dd66` / rebased — Admin password login
  - `7f615ce` — Booking fulfillment refactor
  - `183149f` — Merged with magic-link PR from remote
  - `1adccb2` — Fix bookings not saved after Stripe checkout

User had HTTPS push auth issues; resolved with SSH key on GitHub.

---

## Known issues / user pain points from chat

1. **PowerShell `npm run dev` fails** — execution policy blocks `npm.ps1` → use `npm.cmd run dev` or `start-dev.bat`
2. **Supabase URL** must not include `/rest/v1/` or login shows “Failed to fetch”
3. **Port conflicts** — multiple dev servers on 3000/3001/3002; use URL printed in terminal
4. **Bookings empty after payment** — usually missing Netlify env vars or webhook; player can retry via `?paid=1&session_id=...` + “Retry save booking”
5. **Stripe keys** in `.env.local` were still placeholders locally for checkout
6. **Admin test session** `96cabbca-e569-4c96-aba6-cb09f8565465` (“tes1”, ACMS Point Cook) had no bookings in DB when investigated

---

## Routes

| Path | Purpose |
|------|---------|
| `/` | Landing |
| `/login` | Player magic link |
| `/admin/login` | Admin email + password |
| `/admin` | Admin dashboard (create sessions) |
| `/admin/sessions/[id]` | Booking register + CSV export |
| `/sessions` | Player open sessions |
| `/sessions/[id]` | Book / view own booking |
| `/sessions/settings` | Profile (name, phone) |

---

## Suggested next steps for new agent

1. Confirm Netlify deploy of `1adccb2` is **Published** and env vars are set
2. Run migration **005** in Supabase if not done
3. Verify Stripe webhook deliveries succeed (Stripe Dashboard → Webhooks)
4. End-to-end test: player books on production → row appears in admin within seconds
5. If old payment needs backfill: replay `checkout.session.completed` in Stripe or player hits retry on success URL

---

## Docs in repo

- `web/README.md` — setup, auth, Stripe, Netlify
- `web/.env.local.example` — env template (note on Supabase URL)

---

## User rules / preferences

- Do not commit unless asked; do not update git config
- Minimize scope; match existing code style
- User email used in testing: `udayan.gupta.ndis@gmail.com` (admin may be separate account)
- Windows dev environment
