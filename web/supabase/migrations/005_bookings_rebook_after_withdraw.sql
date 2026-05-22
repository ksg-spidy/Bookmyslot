-- Allow a new booking after withdraw: drop the old full unique on (play_session_id, user_id).
-- Active bookings are still enforced by partial indexes in 004.

alter table public.bookings drop constraint if exists bookings_play_session_id_user_id_key;
