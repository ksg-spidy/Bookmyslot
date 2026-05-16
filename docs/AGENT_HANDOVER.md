# Agent handover — ShuttleBook (Badminton booking)

Use the **block below** as the first message in a **new agent chat** (set workspace root to this repo: `Badminton booking`).

---

## Paste into new agent (system prompt / first message)

```
You are continuing the ShuttleBook project in the "Badminton booking" monorepo.

GOAL
- WhatsApp-first badminton session booking: players message a WhatsApp Business number; backend handles webhooks, Stripe Checkout links, and Supabase state. Web app (Next.js) already exists for logged-in players and admin.

WHAT IS ALREADY DONE (do not redo unless broken)
- Next.js 15 app under `web/` (deployed via Netlify + `@netlify/plugin-nextjs`, see `web/netlify.toml`).
- Supabase: `play_sessions`, `bookings`, `profiles`, Stripe webhook at `web/src/app/api/webhooks/stripe/route.ts` (raw body + signature). Web checkout in `web/src/app/actions/checkout.ts`.
- WhatsApp Cloud API scaffold:
  - `web/src/app/api/webhooks/whatsapp/route.ts` — GET hub.verify + POST with `X-Hub-Signature-256` verification.
  - `web/src/lib/whatsapp/verifySignature.ts`, `sendText.ts`, `processInbound.ts` — text commands HELP, BOOK, STATUS; BOOK creates Stripe Checkout via `web/src/lib/checkout/createWhatsAppCheckout.ts` and sends payment URL in WhatsApp.
  - Stripe webhook updated to accept EITHER `metadata.user_id` (web) OR `metadata.whatsapp_identity_id` (WA) and insert `bookings` accordingly.
- SQL migration file (must be applied in Supabase): `web/supabase/migrations/002_whatsapp.sql` — `whatsapp_identities`, `whatsapp_processed_messages`, nullable `bookings.user_id`, `bookings.whatsapp_identity_id`, XOR constraint, partial unique indexes.
- Env template: `web/.env.local.example` (WhatsApp + existing Supabase/Stripe vars).
- Reference / recovery doc: `docs/BUILD_WHATSAPP_KICKOFF.md`.
- `@supabase/supabase-js` / `@supabase/ssr` were upgraded so `npm run build` passes (previous realtime-js strict type issue).

YOUR CONSTRAINTS
- Prefer small, focused diffs; match existing patterns in `web/src`.
- Run `npm run build` inside `web/` after substantive changes.
- Do not commit secrets; use env vars only.

LIKELY NEXT TASKS (pick what the user asks for)
1. Ops: Confirm `002_whatsapp.sql` was applied on production Supabase; if not, apply and verify RLS/service-role paths.
2. Meta: Register production webhook URL `https://<NETLIFY_DOMAIN>/api/webhooks/whatsapp`, set `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` in Netlify + local `.env.local`.
3. Product: After Stripe `checkout.session.completed`, send a WhatsApp confirmation message to `wa_id` (lookup via `whatsapp_identity_id`); handle waitlist vs confirmed copy.
4. UX parity with `ShuttleBook_Player_Preview.html`: interactive message buttons (max 3 per message per Meta rules), roster reply (“who’s coming”), WITHDRAW + Stripe refund path — all server-side rules.
5. Optional: Link `whatsapp_identities.profile_id` to Supabase `auth.users` / `profiles` (magic link or admin flow).

KEY PATHS
- Web app root: `web/`
- Build: `cd web && npm run build`
- Static HTML spec (conversation demo): repo root `ShuttleBook_Player_Preview.html`
- Plan / feasibility notes: `c:\Users\kumar\.cursor\plans\player_preview_to_app_96e85b0c.plan.md` (if still present)

Start by: (1) reading `web/src/lib/whatsapp/processInbound.ts` and `web/src/app/api/webhooks/stripe/route.ts`, (2) confirming migration status with the user or by inferring from errors, (3) implementing the user’s specific next request.
```

---

## Maintainer notes

| Item | Location |
|------|----------|
| Netlify site | Build `web/`; team context in plan: kumarskand Netlify team |
| Stripe webhook URL | `/api/webhooks/stripe` — must match Stripe Dashboard + `STRIPE_WEBHOOK_SECRET` |
| WhatsApp webhook URL | `/api/webhooks/whatsapp` |
| Initial schema | `web/supabase/migrations/001_initial.sql` |
| WhatsApp schema | `web/supabase/migrations/002_whatsapp.sql` |

If the new agent sees **missing column / relation** errors at runtime, the WhatsApp migration was not applied to the linked Supabase project.
