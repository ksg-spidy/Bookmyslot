-- One-time tokens to associate a WhatsApp identity with a logged-in profile (LINK flow)

create table public.whatsapp_profile_link_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  whatsapp_identity_id uuid not null references public.whatsapp_identities (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

create index whatsapp_profile_link_tokens_expires_idx on public.whatsapp_profile_link_tokens (expires_at);

alter table public.whatsapp_profile_link_tokens enable row level security;
