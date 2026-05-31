# ShuttleBook release checklist

Use after merging to `main`. Default: **zero-Netlify** on PRs (previews skipped); production deploy is explicit.

## 1. Merge to `main`

- Branch `fix/booking-concurrency-and-sync` fast-forwarded or merged.
- Push `origin main`.

## 2. Supabase (prod project)

Linked dev/prod MVP uses one project unless you split later.

```bash
cd web
node scripts/apply-migration.mjs supabase/migrations/006_promoted_at.sql
node scripts/apply-migration.mjs supabase/migrations/007_atomic_booking.sql
```

Verify:

```sql
select proname from pg_proc
where proname in ('fulfill_booking_atomic', 'promote_next_waitlist');
```

Requires `SUPABASE_ACCESS_TOKEN` in `web/.env.local`.

## 3. Netlify environment variables

**Site → Environment variables** (production context). Required:

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only |
| `NEXT_PUBLIC_SITE_URL` | `https://bookbadmintonslot.netlify.app` (no trailing slash) |
| `STRIPE_SECRET_KEY` | Live or test secret |
| `STRIPE_WEBHOOK_SECRET` | From Stripe endpoint pointing at prod |
| `STRIPE_CURRENCY` | e.g. `aud` |

Optional WhatsApp:

| Variable | Notes |
|----------|--------|
| `WHATSAPP_VERIFY_TOKEN` | Same as Meta webhook verify token |
| `WHATSAPP_APP_SECRET` | Meta app secret |
| `WHATSAPP_ACCESS_TOKEN` | Cloud API token |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID |
| `WHATSAPP_PHONE_NUMBER` | E.164 digits for “return to WhatsApp” link |

Optional email: `RESEND_API_KEY`, `BOOKING_EMAIL_FROM`.

**Stripe webhook URL (prod):** `https://bookbadmintonslot.netlify.app/api/webhooks/stripe`  
**WhatsApp webhook URL (prod):** `https://bookbadmintonslot.netlify.app/api/webhooks/whatsapp`

## 4. Production deploy

- Auto-publish on `main` may run one production build after push.
- To skip builds on a commit: include `[skip netlify]` in the commit message.
- Manual: Netlify dashboard → **Deploys** → **Trigger deploy** → **Deploy site**.

## 5. Smoke test (Stripe)

1. Open prod `/browse`, pick an open session, sign in, **Pay & book** (test card).
2. Return with `?paid=1`; page should load quickly; booking appears via client sync or webhook.
3. Netlify **Functions/logs** or Stripe **Webhooks** → `checkout.session.completed` → 200.
4. Optional: fill session → waitlist; withdraw → next waitlist promoted once.

## 6. WhatsApp (if enabled)

1. Meta webhook URL + verify token; subscribe to `messages`.
2. From test number: `LIST`, `BOOK`, `STATUS 1`.
3. Complete test payment; open payment-success page.
4. Confirm inbound dedup (duplicate `msg.id` ignored).

## Rollback

- Revert merge on GitHub; trigger redeploy of previous build.
- DB RPCs can remain (backward compatible) or drop functions if documented.
