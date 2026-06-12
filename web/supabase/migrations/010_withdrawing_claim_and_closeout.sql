-- Transactional withdraw (council action 1) and session closeout (action 2).
--
-- 'withdrawing' is a transient claim status: a withdraw first flips
-- confirmed/waitlist -> withdrawing with a conditional update, so concurrent
-- withdraw attempts (double-tap, web + WhatsApp) lose the race at the database
-- instead of double-refunding. If the refund succeeds but the finalize fails,
-- the row stays in 'withdrawing' and is surfaced on the admin dashboard
-- instead of being lost in server logs.

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending_payment', 'confirmed', 'waitlist', 'withdrawing', 'withdrawn'));

-- Closeout marker: set when leftover paid waitlist players have been refunded
-- after the session started. Lets the cron cheaply skip processed sessions.
alter table public.play_sessions add column if not exists closed_out_at timestamptz;
