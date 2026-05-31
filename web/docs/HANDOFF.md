# ShuttleBook — Agent handoff prompt

Copy everything inside the block below into a **new Cursor chat** to continue this work with full context.

---

```
You are continuing work on **ShuttleBook** — a club badminton session booking MVP (repo folder: `Badminton booking`, app: `web/`).

## Repo & stack

- **Root:** `C:\Users\kumar\.cursor\projects\Badminton booking`
- **App:** `web/` (Next.js 15 App Router, React 19, Tailwind, TypeScript)
- **Deploy:** Netlify (`@netlify/plugin-nextjs`)
- **Backend:** Supabase (Postgres + RLS + magic-link auth)
- **Payments:** Stripe Checkout + webhook `checkout.session.completed`
- **WhatsApp:** Meta Cloud API (`POST /api/webhooks/whatsapp`)
- **Email (optional):** Resend (`RESEND_API_KEY`, `BOOKING_EMAIL_FROM`)

**Domain model:** Books **play sessions** (venue + time + capacity 13–16), NOT courts/slots. Bookings are `confirmed` or `waitlist` after payment. No booking row until payment completes.

**Central fulfillment:** All paid paths → `web/src/lib/checkout/fulfillBooking.ts` → `fulfillBookingFromCheckoutSession()` → Postgres RPC `fulfill_booking_atomic`.

**Shared copy:** `web/src/lib/copy/bookingCopy.ts` — single source for waitlist labels, CTAs, withdraw/promotion text, WA intros, URLs. Extend this file; do not duplicate strings.

**Env helpers:** `web/src/lib/env.ts` — `getPublicSiteUrl()`, `requireServerEnv()`, `warnIfWhatsAppSecretMissing()`.

---

## Git / workflow status (IMPORTANT)

**Intended branch:** `fix/booking-concurrency-and-sync` (batches A + B + C in one branch)

**Current state (as of handoff):**
- All changes are **local and uncommitted** on `main` (branch creation was attempted but may not have succeeded — verify with `git branch --show-current`).
- **Nothing pushed** to GitHub; **no PR**; **no prod deploy**.
- User agreed to workflow: implement → local test → **wait for explicit permission** before commit, push, PR, or prod migration.

**Before prod, user must explicitly approve:** merge, Netlify deploy, Supabase migrations on production.

---

## What this session implemented (Batches A, B, C)

### Batch A — Post-pay sync, idempotency, payment checks

| Change | File(s) | Detail |
|--------|---------|--------|
| Remove SSR blocking sync | `src/app/sessions/[id]/page.tsx` | Removed `await syncBookingAfterPayment()` from server render. Post-pay handled only by client `YourBooking.tsx` (poll + humanized errors). Fixes Netlify ~10s SSR timeout risk. |
| Fresh Stripe idempotency keys | `src/app/actions/checkout.ts`, `src/lib/checkout/createWhatsAppCheckout.ts` | Keys now `checkout-web-${randomUUID()}` / `checkout-wa-${randomUUID()}`. Fixes re-book after withdraw (old fixed key could return stale completed Checkout Session). |
| Stricter paid check | `fulfillBooking.ts`, `syncBooking.ts` | `isCheckoutPaid` / sync now require `payment_status === "paid"` only (not `status === "complete"`). |

### Batch B — Atomic booking (Postgres RPC)

| Change | File(s) | Detail |
|--------|---------|--------|
| Migration 007 | `supabase/migrations/007_atomic_booking.sql` | Adds `fulfill_booking_atomic(...)` and `promote_next_waitlist(...)`. Locks `play_sessions` row (`FOR UPDATE`); assigns confirmed vs waitlist + position atomically; handles withdrawn reactivation; catches `unique_violation` idempotently. |
| Fulfillment uses RPC | `src/lib/checkout/fulfillBooking.ts` | Pre-RPC checks unchanged (metadata, session status, existing checkout id for WA re-notify). Insert/update logic replaced by `admin.rpc('fulfill_booking_atomic', ...)`. Notifications only when `is_new === true`. |
| Withdraw promotion uses RPC | `src/lib/bookings/withdraw.ts` | After refund + status `withdrawn`, calls `promote_next_waitlist` instead of count-then-update. Sets `promoted_at` in RPC. |

**RPC signatures (service_role only):**
```sql
fulfill_booking_atomic(
  p_play_session_id uuid,
  p_user_id uuid,              -- null for WA bookings
  p_whatsapp_identity_id uuid, -- null for web bookings
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text
) → { booking_id, status, waitlist_position, is_new }

promote_next_waitlist(p_play_session_id uuid)
  → { promoted_booking_id, promoted_user_id, promoted_whatsapp_identity_id }
```

### Batch C — Ops / hygiene

| Change | File(s) | Detail |
|--------|---------|--------|
| Env validation | `src/lib/env.ts` | `requireServerEnv`, `getPublicSiteUrl` (localhost in dev; throws in prod if unset). Used in checkout + WA checkout + root layout metadata. |
| Remove hardcoded prod URL | `src/app/layout.tsx` | Dropped fallback `https://bookbadmintonslot.netlify.app`. Uses `getPublicSiteUrl()`. |
| WA message dedup | `src/lib/whatsapp/messageDedup.ts`, `api/webhooks/whatsapp/route.ts` | Uses existing table `whatsapp_processed_messages` (from migration 002). `claimWhatsAppMessage(msg.id)` before `processInboundWhatsAppMessage`. |
| Startup warning | `src/instrumentation.ts`, WA route | Logs if `WHATSAPP_APP_SECRET` missing. |

---

## Prior work already done (P0/P1 — do not redo unless broken)

### P0 — Trust & auth
- Honest waitlist copy + refund link on `SessionDetailBody`
- Dynamic CTAs via `bookingCopy.ts` / `BookButton`
- Auth `?next=` on `/sessions/*` in `middleware.ts`
- Browse guest CTA shows fee
- WhatsApp link success → `/sessions/bookings`

### P0 — WhatsApp multi-session
- Commands: `LIST`, `BOOK`, `BOOK 2`, `STATUS 2`, `ROSTER 2`, `WITHDRAW`, `WITHDRAW 2`, `MY`
- `sessionCommands.ts`, rich payment-success page, `paymentSuccessHtml.ts`

### P1 — Post-pay, email, promotion
- `YourBooking.tsx` client sync + URL cleanup + `syncErrorMessages.ts`
- Booking / withdraw / promotion emails
- `PromotionBanner.tsx` + migration `006_promoted_at.sql`
- Admin unlock, `CopyPlayerLinkButton`, withdraw from My bookings

### Copy alignment
- Unified **Waitlist #N**, calendar in WA/email, withdraw wording, promotion message

---

## BLOCKERS — Supabase migrations (dev + prod)

Apply in order in **Supabase SQL Editor** (or `web/scripts/apply-migration.mjs` if configured):

### 006 — promotion banner (still pending on linked project)
```sql
-- web/supabase/migrations/006_promoted_at.sql
alter table public.bookings
  add column if not exists promoted_at timestamptz;
```

### 007 — atomic booking (REQUIRED for Batch B code)
Run full file: `web/supabase/migrations/007_atomic_booking.sql`

**Without 007:** `fulfillBookingFromCheckoutSession` will fail at RPC (`function fulfill_booking_atomic does not exist`). Webhook fulfillment returns 500.

**Verify after apply:**
```sql
select proname from pg_proc
where proname in ('fulfill_booking_atomic', 'promote_next_waitlist');
```

Also ensure migrations **001–005** are applied (`web/README.md`).

---

## Key files map (updated)

| Area | Path |
|------|------|
| Env / site URL | `src/lib/env.ts` |
| Atomic fulfill RPC caller | `src/lib/checkout/fulfillBooking.ts` |
| Migration RPC definitions | `supabase/migrations/007_atomic_booking.sql` |
| Web checkout | `src/app/actions/checkout.ts` |
| WA checkout | `src/lib/checkout/createWhatsAppCheckout.ts` |
| Post-pay client sync | `src/app/sessions/[id]/YourBooking.tsx`, `src/app/actions/syncBooking.ts` |
| Session page (no SSR sync) | `src/app/sessions/[id]/page.tsx` |
| Withdraw + promote | `src/lib/bookings/withdraw.ts` |
| WA dedup | `src/lib/whatsapp/messageDedup.ts`, `api/webhooks/whatsapp/route.ts` |
| Shared copy | `src/lib/copy/bookingCopy.ts` |
| Stripe webhook | `src/app/api/webhooks/stripe/route.ts` |
| Admin CSV export | `src/app/api/admin/sessions/[id]/export/route.ts` (admin role check present) |

---

## Architecture (current)

```
Player web: browse → login → /sessions/[id] → startCheckout → Stripe
  → Stripe webhook → fulfillBookingFromCheckoutSession → fulfill_booking_atomic (RPC)
  → client YourBooking polls syncBookingAfterPayment if ?paid=1 (no SSR sync)

WhatsApp: BOOK → createWhatsAppCheckout → Stripe
  → payment-success route + webhook → fulfill RPC → notifyWhatsAppBookingConfirmation
  → inbound webhook dedups by msg.id via whatsapp_processed_messages

Withdraw: refund → status withdrawn → promote_next_waitlist (RPC) → email/WA notify
```

**Middleware:** Only matches `/sessions/:path*` (not API webhooks).

---

## Test commands (run from `web/`)

```bash
npm run lint
node scripts/test-p0-copy.mjs
node scripts/test-p0-integration.mjs
npm run dev
```

### Last local test results (fix session)

| Test | Result |
|------|--------|
| ESLint | Pass |
| `test-p0-copy.mjs` | Pass |
| `test-p0-integration.mjs` | 6/7 pass |
| **Failure** | Migration 006 `promoted_at` column missing on linked Supabase |
| **Not run** | RPC 007 (migration not applied); live Stripe pay; concurrent fulfill stress test |

### Manual checks after migration 007

1. Apply 006 + 007 on dev Supabase.
2. Re-run `node scripts/test-p0-integration.mjs` — expect 7/7.
3. Stripe test mode: book session → return with `?paid=1` → page loads fast (no long SSR wait).
4. Fill session to capacity → next booking → waitlist with unique positions.
5. Withdraw confirmed player → next waitlist promoted once.
6. Withdraw → re-book same session → new Stripe checkout (not stale session).

---

## Prod deployment checklist (user approval required)

1. **Git:** Create/checkout `fix/booking-concurrency-and-sync`, commit all relevant files, push, open PR.
2. **Review PR** — focus: `007_atomic_booking.sql`, `fulfillBooking.ts`, `withdraw.ts`, `page.tsx`, checkout idempotency.
3. **Netlify** — skip previews by default (zero-Netlify). When deploying prod, confirm `NEXT_PUBLIC_SITE_URL` and trigger build only after explicit OK.
4. **Merge** — only when user says OK.
5. **Supabase prod** — run 006 (if missing) then 007; verify RPCs exist.
6. **Smoke prod** — Stripe test payment one booking; check webhook logs for fulfill success.
7. **Rollback** — revert PR on GitHub; Netlify redeploys prior build. DB RPCs can stay (backward compatible) or run documented drop if needed.

---

## Code review context (validated findings)

Original external review flagged overbooking race, waitlist collision, SSR sync timeout, WA dedup, idempotency, hardcoded URL. **Batches A–C address those.** Items correctly dismissed or deferred:

- Middleware does **not** run on all routes (only `/sessions/*`).
- Admin CSV export **has** role check.
- Script tests exist (`test-p0-copy.mjs`, `test-p0-integration.mjs`) though no Jest suite.
- Stripe singleton deferred (low impact).

**Still open (P2+):** browse/sessions IA merge, admin edit session, analytics, reminders, fulfillment queue (webhook-only), automated RPC concurrency tests.

---

## Env vars

Required: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_*`, `NEXT_PUBLIC_SITE_URL`

Optional: `RESEND_*`, `WHATSAPP_*`, `WHATSAPP_DEFAULT_PLAY_SESSION_ID`, `WHATSAPP_PHONE_NUMBER`

See `web/.env.local.example`. Never commit `.env.local`.

---

## Conventions

- Minimize scope; match existing patterns.
- User-facing strings → `bookingCopy.ts`.
- Service role: `createServiceClient()` for webhooks/fulfillment/RPC.
- **Only git commit when user explicitly asks.**
- **Only push/merge/deploy prod when user explicitly approves.**
- **Zero-Netlify (default):** PR/branch pushes must not consume Netlify build minutes. Root `netlify.toml` skips `deploy-preview` and `branch-deploy`; use `[skip netlify]` in commit messages when needed. Merge to prod / run a production deploy only after explicit approval.

---

## Suggested first message in new chat

> Continue ShuttleBook from `web/docs/HANDOFF.md`. We're on the concurrency fix branch (batches A–C, uncommitted). First: confirm git branch `fix/booking-concurrency-and-sync`, apply migrations 006 + 007 on dev Supabase, re-run integration tests, then ask me for permission to commit and open PR.

---

## Related docs

- `web/README.md` — setup, migrations, Stripe webhook
- `web/docs/WHATSAPP_SETUP.md` — Meta webhook (if present)
- Prior chats: UX/product review, P0/P1 implementation, codebase review revalidation
```

---

## How to use

1. Open a **new Cursor agent chat**.
2. Paste the entire fenced block above (from `You are continuing work…` through the closing backticks).
3. Add your goal, e.g. *"Apply migrations 006+007, verify tests, then commit and open PR when I approve."*
