-- Failed notification log (council action: silent notification failures).
-- WhatsApp free-form sends outside Meta's 24h window and email failures used
-- to vanish into console.error; now they land here and surface on /admin.

create table public.notification_failures (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp', 'email')),
  -- what we were trying to tell the player, e.g. 'booking_confirmation',
  -- 'waitlist_promoted', 'withdraw', 'closeout'
  kind text not null,
  recipient text,
  booking_id uuid references public.bookings (id) on delete set null,
  play_session_id uuid references public.play_sessions (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index notification_failures_unresolved_idx
  on public.notification_failures (created_at)
  where resolved_at is null;

alter table public.notification_failures enable row level security;

-- Admins can read and resolve; only the service role writes new rows.
create policy "notification_failures_select_admin"
on public.notification_failures for select to authenticated
using (public.is_admin());

create policy "notification_failures_update_admin"
on public.notification_failures for update to authenticated
using (public.is_admin())
with check (public.is_admin());
