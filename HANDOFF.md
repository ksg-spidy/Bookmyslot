# ShuttleBook — Agent handoff

**Copy everything inside the block below into a new Cursor agent chat** when continuing work on this repo.

---

## Paste this as your first message (handover prompt)

```
You are working on ShuttleBook — a badminton session booking MVP.

Repo: https://github.com/ksg-spidy/Bookmyslot.git
Local: c:\Users\kumar\.cursor\projects\Badminton booking
App: web/ (Next.js 15, Netlify base dir = web)
Production: https://bookbadmintonslot.netlify.app
Supabase: https://galtalsgxrbqapkfatky.supabase.co (no /rest/v1/ suffix)

Read HANDOFF.md in the repo root for full context before changing code.

Stack: Next.js 15, Supabase (magic-link players, password admins), Stripe Checkout + webhook, optional WhatsApp booking.

Player flows:
- Public browse: /browse, /browse/[id] (no login; counts via service role)
- Auth: /login → /auth/confirm → sessions
- Book: /sessions → /sessions/[id] → Pay & book (requires profile name+phone)
- My bookings: /sessions/bookings
- Withdraw: /sessions/[id] when confirmed/waitlist (Stripe partial refund)

Admin: /admin/login → /admin (create sessions in AUD, lock slots) → /admin/sessions/[id] (roster, CSV)

Booking saved by Stripe webhook OR client syncBookingAfterPayment on ?paid=1&session_id=...

Critical libs:
- web/src/lib/checkout/fulfillBooking.ts
- web/src/lib/bookings/withdraw.ts (shared web + WhatsApp)
- web/src/lib/bookings/counts.ts
- web/src/lib/datetime.ts (BOOKING_TZ_OFFSET admin input, NEXT_PUBLIC_BOOKING_TIMEZONE display)

Windows dev: use npm.cmd run dev (not npm.ps1). Do not commit unless asked. Minimize scope.

Uncommitted/local: P0+P1 UI may exist only in working tree — run git status. Build: cd web && npm.cmd run build.

Suggested next: deploy P0+P1, smoke-test withdraw + browse, then P2 (privacy footer, .ics calendar, waitlist email for web users).
```

---

## Project

**ShuttleBook** — Badminton session booking MVP.

| Item | Value |
|------|--------|
| **Repo** | https://github.com/ksg-spidy/Bookmyslot.git |
| **Local path** | `c:\Users\kumar\.cursor\projects\Badminton booking` |
| **App directory** | `web/` (Netlify base directory = `web`) |
| **Production** | https://bookbadmintonslot.netlify.app |
| **Supabase project** | `galtalsgxrbqapkfatky` |

---

## Stack

- **Next.js 15** + Turbopack — `npm.cmd run dev` on Windows (PowerShell may block `npm.ps1`; use `npm.cmd` or `web/start-dev.bat`)
- **Supabase** — Postgres, RLS, magic-link auth (players), password auth (admins)
- **Stripe** — Checkout + webhook `checkout.session.completed`
- **Deploy** — Netlify (`web/netlify.toml`, `@netlify/plugin-nextjs`)
- **Optional** — WhatsApp Cloud API (`/api/webhooks/whatsapp`)

---

## Routes (current)

| Path | Auth | Purpose |
|------|------|---------|
| `/` | Public | Landing, “How it works”, links to browse / login / admin |
| `/browse` | Public | Open sessions list with spots remaining |
| `/browse/[id]` | Public | Session preview; “Sign in to book” |
| `/login` | Public | Player magic link |
| `/auth/confirm` | Public | Second step after email link (anti-prefetch) |
| `/auth/callback` | — | Supabase OAuth callback |
| `/sessions` | Player | Open sessions (same data as browse, authenticated) |
| `/sessions/[id]` | Player | Book, view status, withdraw |
| `/sessions/bookings` | Player | My bookings (upcoming / cancelled) |
| `/sessions/settings` | Player | Profile (name, phone) — **required before checkout** |
| `/admin/login` | Public | Admin email + password |
| `/admin` | Admin | Create sessions, lock slots |
| `/admin/sessions/[id]` | Admin | Roster, CSV export, manual sync form |
| `/api/webhooks/stripe` | Stripe | Fulfill bookings |
| `/api/webhooks/whatsapp` | Meta | WhatsApp BOOK / WITHDRAW / STATUS |
| `/whatsapp/link` | — | Link WhatsApp identity to profile |

---

## Auth model

| Role | Login | Notes |
|------|--------|------|
| **Player** | `/login` | `signInWithOtp` → email → `/auth/confirm` → “Complete sign-in” |
| **Admin** | `/admin/login` | `signInWithPassword`; `profiles.role` must be `admin` |

Admin routes: `web/src/app/admin/(protected)/` (layout enforces admin).

**Supabase dashboard:** Email + password enabled; redirect URLs include production + `http://localhost:3000/auth/callback`.

Promote admin:
```sql
update public.profiles set role = 'admin' where id = 'USER-UUID';
```

---

## Booking flow (critical)

### Pay & book (web)

1. Player completes profile (`full_name`, `phone`) — enforced in `startCheckout` and UI.
2. `/sessions/[id]` → **Pay & book** → `web/src/app/actions/checkout.ts` → Stripe Checkout.
3. Success URL: `{NEXT_PUBLIC_SITE_URL}/sessions/{id}?paid=1&session_id={CHECKOUT_SESSION_ID}`.
4. Booking row created by:
   - **Stripe webhook** → `POST /api/webhooks/stripe` → `fulfillBookingFromCheckoutSession()` (service role), **or**
   - **Client fallback** → `syncBookingAfterPayment()` + polling in `YourBooking.tsx`.

### Capacity & waitlist

- **Confirmed** count vs `max_players` → spots remaining on UI (`lib/bookings/counts.ts`).
- If full at payment fulfillment → `waitlist` + `waitlist_position` (`fulfillBooking.ts`).

### Withdraw / cancel (web — implemented)

- UI: `WithdrawButton.tsx` on session detail when booking is `confirmed` or `waitlist`, session still `open`, before `starts_at`.
- Server: `web/src/app/actions/withdrawBooking.ts` → `lib/bookings/withdraw.ts`.
- Stripe partial refund: `booking_fee_cents - withdrawal_fee_cents`; status → `withdrawn`; promotes first waitlist to `confirmed` (WhatsApp notify if promoted user is on WA).
- Re-book after withdraw: migration **005** + fulfillment reactivates withdrawn row on new checkout.

### WhatsApp (parallel path)

- `lib/whatsapp/waBookingOps.ts` — `withdrawWhatsappBooking` delegates to shared `withdrawBooking`.
- Inbound: `lib/whatsapp/processInbound.ts`.

---

## Key files (by concern)

| Concern | Files |
|---------|--------|
| Checkout | `app/actions/checkout.ts`, `app/actions/syncBooking.ts`, `lib/checkout/fulfillBooking.ts` |
| Withdraw | `app/actions/withdrawBooking.ts`, `lib/bookings/withdraw.ts`, `sessions/[id]/WithdrawButton.tsx` |
| Active booking query | `lib/bookings/queries.ts` (`ACTIVE_BOOKING_STATUSES`) |
| Spots / counts | `lib/bookings/counts.ts` |
| Session list | `lib/sessions/openSessions.ts`, `components/SessionCard.tsx` |
| Display times | `lib/datetime.ts`, `lib/money.ts` |
| Profile gate | `lib/profile.ts`, `components/ProfileIncompleteBanner.tsx` |
| Public browse | `app/browse/page.tsx`, `app/browse/[id]/page.tsx` (uses `createServiceClient` for counts) |
| Admin create session | `app/actions/sessions.ts`, `admin/(protected)/AdminSessionForm.tsx` (fees in **AUD**) |
| Layout / nav | `components/SiteHeader.tsx` |
| Stripe webhook | `app/api/webhooks/stripe/route.ts` |

---

## Database migrations (Supabase SQL Editor, in order)

1. `web/supabase/migrations/001_initial.sql`
2. `002_whatsapp.sql` (if using WhatsApp)
3. `003_*` (link tokens, if present)
4. `004_booking_unique_active_only.sql`
5. **`005_bookings_rebook_after_withdraw.sql`** — required for re-book after withdraw

---

## Environment variables

**Local:** `web/.env.local` (never commit) — copy from `web/.env.local.example`.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | No `/rest/v1/` suffix |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhooks, browse counts, admin roster |
| `NEXT_PUBLIC_SITE_URL` | No trailing slash |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Real keys on Netlify |
| `STRIPE_CURRENCY` | Optional, default `aud` |
| `BOOKING_TZ_OFFSET` | Admin `datetime-local` → UTC (e.g. `+10:00`) |
| `NEXT_PUBLIC_BOOKING_TIMEZONE` | Player display (e.g. `Australia/Sydney`) |
| WhatsApp vars | See `.env.local.example` |

**Stripe webhook:** `https://bookbadmintonslot.netlify.app/api/webhooks/stripe` — event `checkout.session.completed`.

---

## UI / product state (P0 + P1 — May 2026)

Implemented in working tree (verify `git status` / deploy):

- **P0:** Home value prop + how-it-works; login copy; OG metadata + Inter + favicon; session cards with date/TZ + AUD; admin fees in dollars.
- **P1:** Public `/browse`; spots remaining; profile before book; `/sessions/bookings`; web withdraw with refund.

**P2 (local, with P0+P1):** Site footer + `/privacy` + `/refund`; `.ics` download (`/api/calendar/session/[id]`); venue map link; waitlist promotion email via Resend (`RESEND_API_KEY`, `BOOKING_EMAIL_FROM`).

**Not yet built:** admin “copy share link”, edit session, PWA, analytics.

---

## Known issues / dev tips

1. **PowerShell** — `npm run dev` may fail on `npm.ps1` → use `npm.cmd run dev`.
2. **Supabase URL** — must not include `/rest/v1/` or client shows “Failed to fetch”.
3. **Port conflicts** — check terminal for actual port (3000/3001…).
4. **Payment without DB row** — missing Netlify env or webhook; user can use `?paid=1&session_id=...` + “Retry save booking”.
5. **Browse counts** — server uses service role (no anon RLS policy on `bookings`).
6. **Withdraw** — requires `stripe_payment_intent_id` on booking row.

---

## Build & verify

```powershell
cd "c:\Users\kumar\.cursor\projects\Badminton booking\web"
npm.cmd run build
npm.cmd run dev
```

Production smoke-test checklist:

- [ ] `/browse` loads without login
- [ ] Login → profile → book → booking in admin
- [ ] Spots remaining updates after booking
- [ ] Withdraw refunds and frees spot / promotes waitlist
- [ ] Stripe webhook delivery 2xx in dashboard

---

## Git / deploy

- **Branch:** `main` → `origin` (SSH: `git@github.com:ksg-spidy/Bookmyslot.git`)
- **Do not commit** unless the user asks; do not change git config.
- After local P0+P1 changes: commit, push, confirm Netlify **Published**.

Recent `main` themes (may predate P0+P1): magic-link prefetch fix (`/auth/confirm`), booking fulfillment refactor, admin password login.

---

## Docs & prototypes

| File | Purpose |
|------|---------|
| `web/README.md` | Setup, auth, Stripe, Netlify |
| `web/.env.local.example` | Env template |
| `ShuttleBook_Player_Preview.html` | WhatsApp-style mobile UI prototype (not production) |
| `ShuttleBook_Prototype.html` | Earlier prototype |

---

## User preferences

- Windows environment
- Minimize scope; match existing GitHub-dark UI (`#0d1117`, green CTAs)
- Only create commits when explicitly requested
- Test email used historically: `udayan.gupta.ndis@gmail.com`

---

## Suggested next steps for a new agent

1. `git status` — confirm whether P0+P1 is committed and deployed to Netlify.
2. Run `npm.cmd run build` in `web/`.
3. Confirm migration **005** applied in Supabase.
4. Production E2E: browse → login → profile → book → admin sees row → withdraw.
5. Pick one P2 item (footer + policies, `.ics`, or waitlist email for web users) if user wants more product work.
