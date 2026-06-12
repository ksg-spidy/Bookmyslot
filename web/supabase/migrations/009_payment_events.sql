-- Append-only payment ledger (council action 1 / Option B).
-- Every real money movement gets a row here, written only by the service role.
-- Balances shown to admins are SUMs over this table, never derived from headcounts.

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete set null,
  play_session_id uuid references public.play_sessions (id) on delete set null,
  type text not null check (type in ('charge', 'refund', 'adjustment')),
  amount_cents int not null check (amount_cents >= 0),
  stripe_ref text,
  -- Dedup key so webhook + client-sync (or any retry) can both attempt the
  -- write and exactly one row lands. e.g. 'charge:<checkout_session_id>'.
  idempotency_key text not null unique,
  note text,
  created_at timestamptz not null default now()
);

create index payment_events_play_session_idx on public.payment_events (play_session_id);
create index payment_events_booking_idx on public.payment_events (booking_id);

alter table public.payment_events enable row level security;

-- Admins can read; nobody can write through PostgREST (service role bypasses RLS).
create policy "payment_events_select_admin"
on public.payment_events for select to authenticated
using (public.is_admin());
