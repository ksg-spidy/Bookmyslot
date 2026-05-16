-- Re-booking after WITHDRAW: only one *active* booking per session+identity/user.
-- Previous partial unique treated withdrawn rows as conflicting with new inserts.

drop index if exists bookings_play_session_wa_unique;
create unique index bookings_play_session_wa_unique
  on public.bookings (play_session_id, whatsapp_identity_id)
  where
    whatsapp_identity_id is not null
    and status in ('confirmed', 'waitlist', 'pending_payment');

drop index if exists bookings_play_session_user_unique;
create unique index bookings_play_session_user_unique
  on public.bookings (play_session_id, user_id)
  where
    user_id is not null
    and status in ('confirmed', 'waitlist', 'pending_payment');
