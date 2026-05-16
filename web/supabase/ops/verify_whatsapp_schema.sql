-- Run in Supabase SQL Editor after deploying migrations 001–004.
-- Expect one row per check; ok = false means that object is missing or migration not applied.

select 'whatsapp_identities table' as check_name,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'whatsapp_identities'
  ) as ok;

select 'bookings.whatsapp_identity_id column' as check_name,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'whatsapp_identity_id'
  ) as ok;

select 'bookings_user_xor_wa constraint' as check_name,
  exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'bookings' and c.conname = 'bookings_user_xor_wa'
  ) as ok;

select 'whatsapp_profile_link_tokens table (003)' as check_name,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'whatsapp_profile_link_tokens'
  ) as ok;

select 'bookings_play_session_wa_unique index (004)' as check_name,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'bookings_play_session_wa_unique'
  ) as ok;

select 'bookings_play_session_user_unique index (004)' as check_name,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'bookings_play_session_user_unique'
  ) as ok;
