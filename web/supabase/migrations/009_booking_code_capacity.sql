-- Admin-configurable booking code capacity and waitlist limits.

alter table public.play_sessions
  add column booking_code_count int,
  add column players_per_booking_code int,
  add column waitlist_per_booking_code int;

update public.play_sessions
set
  booking_code_count = 1,
  players_per_booking_code = max_players,
  waitlist_per_booking_code = 3
where booking_code_count is null
   or players_per_booking_code is null
   or waitlist_per_booking_code is null;

alter table public.play_sessions
  alter column booking_code_count set default 1,
  alter column booking_code_count set not null,
  alter column players_per_booking_code set default 6,
  alter column players_per_booking_code set not null,
  alter column waitlist_per_booking_code set default 3,
  alter column waitlist_per_booking_code set not null;

alter table public.play_sessions
  drop constraint if exists play_sessions_max_players_check,
  add constraint play_sessions_booking_code_count_check
    check (booking_code_count >= 1 and booking_code_count <= 50),
  add constraint play_sessions_players_per_booking_code_check
    check (players_per_booking_code >= 1 and players_per_booking_code <= 32),
  add constraint play_sessions_waitlist_per_booking_code_check
    check (waitlist_per_booking_code >= 0 and waitlist_per_booking_code <= 32),
  add constraint play_sessions_max_players_check
    check (max_players >= 1 and max_players <= 512),
  add constraint play_sessions_code_capacity_matches_max_players_check
    check (max_players = booking_code_count * players_per_booking_code);

create or replace function public.fulfill_booking_atomic(
  p_play_session_id uuid,
  p_user_id uuid,
  p_whatsapp_identity_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text
)
returns table (
  booking_id uuid,
  status text,
  waitlist_position int,
  is_new boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_confirmed_count int;
  v_waitlist_count int;
  v_waitlist_capacity int;
  v_status text;
  v_waitlist_position int;
  v_existing record;
  v_withdrawn_id uuid;
  v_booking_id uuid;
begin
  if (p_user_id is null and p_whatsapp_identity_id is null)
    or (p_user_id is not null and p_whatsapp_identity_id is not null) then
    raise exception 'invalid_booking_identity';
  end if;

  select b.id, b.status, b.waitlist_position
  into v_existing
  from bookings b
  where b.stripe_checkout_session_id = p_stripe_checkout_session_id
  limit 1;

  if v_existing.id is not null then
    booking_id := v_existing.id;
    status := v_existing.status;
    waitlist_position := v_existing.waitlist_position;
    is_new := false;
    return next;
    return;
  end if;

  select b.id, b.status, b.waitlist_position
  into v_existing
  from bookings b
  where b.play_session_id = p_play_session_id
    and b.status in ('confirmed', 'waitlist', 'pending_payment')
    and (
      (p_user_id is not null and b.user_id = p_user_id)
      or (p_whatsapp_identity_id is not null and b.whatsapp_identity_id = p_whatsapp_identity_id)
    )
  limit 1;

  if v_existing.id is not null then
    booking_id := v_existing.id;
    status := v_existing.status;
    waitlist_position := v_existing.waitlist_position;
    is_new := false;
    return next;
    return;
  end if;

  select
    ps.id,
    ps.max_players,
    ps.status,
    ps.booking_code_count,
    ps.waitlist_per_booking_code
  into v_session
  from play_sessions ps
  where ps.id = p_play_session_id
  for update;

  if not found then
    raise exception 'play_session_not_found';
  end if;

  if v_session.status not in ('open', 'locked') then
    raise exception 'play_session_unavailable:%', v_session.status;
  end if;

  select count(*)::int
  into v_confirmed_count
  from bookings b
  where b.play_session_id = p_play_session_id
    and b.status = 'confirmed';

  if v_confirmed_count < v_session.max_players then
    v_status := 'confirmed';
    v_waitlist_position := null;
  else
    v_waitlist_capacity := v_session.booking_code_count * v_session.waitlist_per_booking_code;

    select count(*)::int
    into v_waitlist_count
    from bookings b
    where b.play_session_id = p_play_session_id
      and b.status = 'waitlist';

    if v_waitlist_count >= v_waitlist_capacity then
      raise exception 'waitlist_full';
    end if;

    v_status := 'waitlist';
    select coalesce(max(b.waitlist_position), 0) + 1
    into v_waitlist_position
    from bookings b
    where b.play_session_id = p_play_session_id
      and b.status = 'waitlist';
  end if;

  select b.id
  into v_withdrawn_id
  from bookings b
  where b.play_session_id = p_play_session_id
    and b.status = 'withdrawn'
    and (
      (p_user_id is not null and b.user_id = p_user_id)
      or (p_whatsapp_identity_id is not null and b.whatsapp_identity_id = p_whatsapp_identity_id)
    )
  order by b.updated_at desc
  limit 1;

  if v_withdrawn_id is not null then
    update bookings b
    set
      status = v_status,
      stripe_checkout_session_id = p_stripe_checkout_session_id,
      stripe_payment_intent_id = p_stripe_payment_intent_id,
      waitlist_position = v_waitlist_position,
      promoted_at = null,
      updated_at = now()
    where b.id = v_withdrawn_id
    returning b.id into v_booking_id;
  else
    insert into bookings (
      play_session_id,
      user_id,
      whatsapp_identity_id,
      status,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      waitlist_position,
      updated_at
    )
    values (
      p_play_session_id,
      p_user_id,
      p_whatsapp_identity_id,
      v_status,
      p_stripe_checkout_session_id,
      p_stripe_payment_intent_id,
      v_waitlist_position,
      now()
    )
    returning id into v_booking_id;
  end if;

  booking_id := v_booking_id;
  status := v_status;
  waitlist_position := v_waitlist_position;
  is_new := true;
  return next;

exception
  when unique_violation then
    select b.id, b.status, b.waitlist_position
    into v_existing
    from bookings b
    where b.stripe_checkout_session_id = p_stripe_checkout_session_id
       or (
         b.play_session_id = p_play_session_id
         and b.status in ('confirmed', 'waitlist', 'pending_payment')
         and (
           (p_user_id is not null and b.user_id = p_user_id)
           or (p_whatsapp_identity_id is not null and b.whatsapp_identity_id = p_whatsapp_identity_id)
         )
       )
    order by case when b.stripe_checkout_session_id = p_stripe_checkout_session_id then 0 else 1 end
    limit 1;

    if v_existing.id is null then
      raise;
    end if;

    booking_id := v_existing.id;
    status := v_existing.status;
    waitlist_position := v_existing.waitlist_position;
    is_new := false;
    return next;
end;
$$;
