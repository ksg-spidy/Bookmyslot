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
  `http://localhost:3000/auth/confirm`  
  `https://your-site.netlify.app/auth/callback`  
  `https://your-site.netlify.app/auth/confirm`

## 2b. Magic-link email template (recommended)

Default Supabase magic-link emails are minimal. ShuttleBook includes branded templates that explain why the email was sent and what happens when the link is clicked.

1. **Authentication → Email Templates → Magic Link**
2. **Subject:** copy from `supabase/email-templates/magic-link-subject.txt`
3. **Body:** paste HTML from `supabase/email-templates/magic-link.html`
4. **Save**

See `supabase/email-templates/README.md` for variables, OTP expiry alignment, and optional local `config.toml` setup.

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

## 5. Local run

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with magic link, go to **Admin** (admin role), create a session, then open **Player view** and book with another test user (or incognito).

## 6. Netlify

- **Base directory:** `web` (if the repo root is `Badminton booking`).
- Build: `npm run build` (already in `netlify.toml`).
- Install `@netlify/plugin-nextjs` (listed in `package.json` devDependencies).
- Add the same env vars in **Site configuration → Environment variables**.

## Routes

| Path | Role |
|------|------|
| `/` | Landing / redirect |
| `/login` | Magic link |
| `/sessions` | Player sessions list |
| `/sessions/[id]` | Book (Stripe) after sign-in |
| `/admin` | Admin dashboard |
| `/admin/sessions/[id]` | Booking register |

## Legacy static demos

The original HTML prototypes remain in the parent `Badminton booking` folder (`ShuttleBook_Prototype.html`, `deploy/index.html`).
