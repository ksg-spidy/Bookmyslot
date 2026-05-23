# Supabase auth email templates (ShuttleBook)

Copy these into your Supabase project so magic-link emails explain **why** the message was sent and **what happens** when the link is clicked.

## Magic Link

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **Email Templates**.
2. Select **Magic Link**.
3. **Subject:** paste the single line from `magic-link-subject.txt`.
4. **Body:** switch to source/HTML mode and paste the full contents of `magic-link.html`.
5. **Save.**

### Align link expiry (recommended)

In **Authentication** → **Providers** → **Email**, confirm **OTP expiry** matches the copy (default is often **3600** seconds = 1 hour). If you change it in Supabase, update the “expires in 1 hour” line in `magic-link.html` and the login page on `/login`.

### Template variables used

| Variable | Purpose |
|----------|---------|
| `{{ .Email }}` | Who requested sign-in |
| `{{ .ConfirmationURL }}` | One-time sign-in button and fallback URL |
| `{{ .RedirectTo }}` | Confirm page URL from `signInWithOtp` (must be allow-listed); CTA appends `token_hash` + `type` |
| `{{ .TokenHash }}` | Server-side verification via `/auth/callback` (avoids PKCE / prefetch issues) |

### Why `/auth/confirm`?

Email providers often **prefetch** links in HTML. The app verifies the token only when the user clicks **Complete sign-in** (POST server action), not via a `/auth/callback` link in the page. The email should link to `/auth/confirm?…&token_hash=…` only — never use `{{ .ConfirmationURL }}` (that verifies on first GET and causes `otp_expired`).

**Redirect URLs (required):** In **Authentication → URL configuration**, add (replace host with yours):

- `https://bookbadmintonslot.netlify.app/auth/confirm**`
- `https://bookbadmintonslot.netlify.app/auth/callback**`

If these are missing, Supabase may fall back to **Site URL** only (`https://…netlify.app`), and the template would build an invalid link like `…netlify.app&token_hash=…` (browser “invalid URL” error). The template now falls back to `/auth/confirm?_sb=1`, but allow-listing the confirm URL is still required so `emailRedirectTo` from the app is honoured.

**Site URL** should be `https://bookbadmintonslot.netlify.app` (no trailing path).

## Local Supabase CLI (optional)

If you run Supabase locally with `config.toml`, you can point templates at these files:

```toml
[auth.email.template.magic_link]
subject = "Sign in to ShuttleBook — link expires in 1 hour"
content_path = "./supabase/email-templates/magic-link.html"
```

Adjust the path relative to your `config.toml` location.
