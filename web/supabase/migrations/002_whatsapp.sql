-- WhatsApp identities + booking path without web auth user

create table public.whatsapp_identities (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique,
  profile_id uuid references public.profiles (id) on delete set null,
  display_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index whatsapp_identities_profile_id_idx on public.whatsapp_identities (profile_id);

alter table public.whatsapp_identities enable row level security;

create table public.whatsapp_processed_messages (
  wa_message_id text primary key,
  processed_at timestamptz default now()
);

alter table public.whatsapp_processed_messages enable row level security;

alter table public.bookings alter column user_id drop not null;

alter table public.bookings
  add column whatsapp_identity_id uuid references public.whatsapp_identities (id) on delete cascade;

alter table public.bookings
  add constraint bookings_user_xor_wa check (
    (user_id is not null and whatsapp_identity_id is null)
    or (user_id is null and whatsapp_identity_id is not null)
  );

alter table public.bookings drop constraint if exists bookings_play_session_id_user_id_key;

create unique index bookings_play_session_user_unique
  on public.bookings (play_session_id, user_id)
  where user_id is not null;

create unique index bookings_play_session_wa_unique
  on public.bookings (play_session_id, whatsapp_identity_id)
  where whatsapp_identity_id is not null;
