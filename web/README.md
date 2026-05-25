# ShuttleBook (MVP phases 1 & 2)

Next.js app with **Supabase** (Postgres + magic-link auth) and **Stripe Checkout** + webhooks. Deploy on **Netlify** with `@netlify/plugin-nextjs`.

## Prerequisites

- Node.js 20+ and npm (for local dev)
- A [Supabase](https://supabase.com) project (free tier is fine)
- A [Stripe](https://stripe.com) account — use **test** keys first
- Netlify site connected to this repo or manual deploys

## 1. Database

1. Open Supabase **SQL Editor**.
2. Paste and run `supabase/migrations/001_initial.sql`.
3. **Authentication → Sign up** once with your email (magic link).
4. **Authentication → Users** → copy your user UUID.
5. Run:

   ```sql
   update public.profiles set role = 'admin' where id = 'YOUR-USER-UUID';
   ```

## 2. Supabase auth URLs

**Authentication → URL configuration**

- **Site URL:** `http://localhost:3000` (dev) and your production URL (e.g. `https://your-site.netlify.app`).
- **Redirect URLs:** add (wildcards help, e.g. `https://your-site.netlify.app/**`)  
  `http://localhost:3000/auth/callback`  
  `http://localhost:3000/auth/confirm**`  
  `https://your-site.netlify.app/auth/callback**`  
  `https://your-site.netlify.app/auth/confirm**`  
  Without `/auth/confirm**`, magic links may redirect to the site root only and produce invalid URLs (`…netlify.app&token_hash=…`).

## 2b. Magic-link email template (recommended)

Default Supabase magic-link emails are minimal. ShuttleBook includes branded templates that explain why the email was sent and what happens when the link is clicked.

1. **Authentication → Email Templates → Magic Link**
2. **Subject:** copy from `supabase/email-templates/magic-link-subject.txt`
3. **Body:** paste HTML from `supabase/email-templates/magic-link.html`
4. **Save**

See `supabase/email-templates/README.md` for variables, OTP expiry alignment, and optional local `config.toml` setup.

### Admin password sign-in (players keep magic link)

1. **Authentication → Providers → Email** — enable Email, turn on **Confirm email** if you want, and enable **Email + password** (allow users to sign in with password).
2. Set the admin password (pick one):
   - **Recommended (no email):** from `web/`, with `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`:
     ```bash
     node scripts/set-admin-password.mjs admin@example.com 'YourSecurePassword'
     ```
   - **Dashboard:** **Authentication → Users** → user → **Reset password** — only works within Supabase’s email limits (see below).
3. Ensure `profiles.role = 'admin'` for that user (the script above sets this; or see step 5 in §1).
4. Admins sign in at **`/admin/login`** with email + password. Players use **`/login`** (magic link only).

#### “Email rate limit exceeded” on password reset

Supabase’s **built-in SMTP** allows only a few auth emails per hour (signup, magic link, and **password recovery** all count). Repeated **Send password recovery** in the dashboard hits `over_email_send_rate_limit` on `/auth/v1/recover`.

**Immediate fix:** use `scripts/set-admin-password.mjs` (service role updates the password directly; no email sent).

**Production fix:** **Authentication → SMTP** — configure custom SMTP (e.g. Resend, SendGrid) so recovery and magic-link limits follow your provider, not the built-in cap. Optionally raise limits under **Authentication → Rate Limits**.

## 3. Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Where |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase **Settings → API** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | Same (**server only** — never expose to the browser) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` or production origin, no trailing slash |
| `STRIPE_SECRET_KEY` | Stripe **Developers → API keys** (Secret key) |
| `STRIPE_WEBHOOK_SECRET` | From Stripe webhook endpoint (below) |
| `STRIPE_CURRENCY` | Optional, default `aud` |
| `BOOKING_TZ_OFFSET` | Optional — offset for admin session times, e.g. `+10:00` (AEST) or `+11:00` (AEDT) |

### Profile

Players should open **Profile** (`/sessions/settings`) and set **name** and **phone** so the admin booking list is useful.

### Admin CSV

On a session’s booking page: **Export CSV** downloads bookings for that session (admin only).

## 4. Stripe webhook

1. **Developers → Webhooks → Add endpoint**
2. URL: `https://your-site.netlify.app/api/webhooks/stripe` (local: use [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward).
3. Event: `checkout.session.completed`
4. Copy the **signing secret** into `STRIPE_WEBHOOK_SECRET`

Bookings are created when the webhook runs, or when the player returns from checkout (server sync). On Netlify you **must** set real `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` (not placeholders).

Run `supabase/migrations/005_bookings_rebook_after_withdraw.sql` in the SQL Editor after earlier migrations.

## 5. Local run

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Admin: **Admin sign-in** → `/admin/login`. Players: magic link at `/login`. Create a session in admin, then book from **Player view** with another account (or incognito).

## 6. WhatsApp booking (optional)

Players can book via WhatsApp (**BOOK**, **STATUS**, **ROSTER**, **WITHDRAW**, **LINK**).  
Step-by-step Meta Developer + Cloud API setup: **[docs/WHATSAPP_SETUP.md](docs/WHATSAPP_SETUP.md)**.

Webhook: `https://your-site.netlify.app/api/webhooks/whatsapp`

## 7. Netlify

- **Base directory:** `web` (repo root `netlify.toml` sets `base = "web"`).
- Build: `npm run build` (already in `netlify.toml`).
- Install `@netlify/plugin-nextjs` (listed in `package.json` devDependencies).
- Add the same env vars in **Site configuration → Environment variables**.

## Routes

| Path | Role |
|------|------|
| `/` | Landing / redirect |
| `/browse` | Public session list |
| `/login` | Player magic link |
| `/admin/login` | Admin email + password |
| `/sessions` | Player sessions list |
| `/sessions/[id]` | Book (Stripe) after sign-in |
| `/sessions/bookings` | My bookings |
| `/whatsapp/link` | Link WhatsApp number to web profile |
| `/admin` | Admin dashboard |
| `/admin/sessions/[id]` | Booking register |
| `/api/webhooks/whatsapp` | Meta WhatsApp inbound |

## Legacy static demos

The original HTML prototypes remain in the parent `Badminton booking` folder (`ShuttleBook_Prototype.html`, `deploy/index.html`).
