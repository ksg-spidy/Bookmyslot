-- ShuttleBook MVP — run entire script in Supabase SQL Editor

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'player' check (role in ('admin', 'player')),
  full_name text,
  phone text,
  created_at timestamptz default now()
);

-- Avoids RLS recursion when checking admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
on public.profiles for select
using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'player',
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.play_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Saturday session',
  venue text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_players int not null check (max_players >= 4 and max_players <= 32),
  booking_fee_cents int not null default 1500,
  withdrawal_fee_cents int not null default 200,
  booking_closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'locked')),
  created_at timestamptz default now()
);

alter table public.play_sessions enable row level security;

create policy "play_sessions_select_authenticated"
on public.play_sessions for select to authenticated
using (true);

create policy "play_sessions_insert_admin"
on public.play_sessions for insert to authenticated
with check (public.is_admin());

create policy "play_sessions_update_admin"
on public.play_sessions for update to authenticated
using (public.is_admin());

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  play_session_id uuid not null references public.play_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('pending_payment', 'confirmed', 'waitlist', 'withdrawn')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  waitlist_position int,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (play_session_id, user_id)
);

alter table public.bookings enable row level security;

create policy "bookings_select_own_or_admin"
on public.bookings for select to authenticated
using (user_id = auth.uid() or public.is_admin());

-- Then: sign up once, then run (replace UUID):
-- update public.profiles set role = 'admin' where id = 'YOUR-USER-UUID';
