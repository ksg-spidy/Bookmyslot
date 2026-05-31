-- Track when a waitlisted booking was promoted to confirmed (in-app notice).
alter table public.bookings
  add column if not exists promoted_at timestamptz;
