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

Email providers often **prefetch** magic links, which consumes the one-time token (`otp_expired`). The template links to `/auth/confirm` first; the user clicks **Complete sign-in** to run verification. Ensure **Redirect URLs** include `/auth/confirm` and `/auth/callback` for your production host.

## Local Supabase CLI (optional)

If you run Supabase locally with `config.toml`, you can point templates at these files:

```toml
[auth.email.template.magic_link]
subject = "Sign in to ShuttleBook — link expires in 1 hour"
content_path = "./supabase/email-templates/magic-link.html"
```

Adjust the path relative to your `config.toml` location.
