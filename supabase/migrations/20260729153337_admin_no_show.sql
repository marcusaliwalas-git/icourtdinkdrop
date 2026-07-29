-- Admin-only: mark a booking that already started as a no-show (spec 4.5 "Admin can mark
-- no-show"). Only applies to confirmed bookings whose start time has passed. Increments the
-- booker's no_show_count (used later for the Phase 4 "N no-shows restricts booking privileges"
-- rule — this migration only adds the counter and the marking action, not that enforcement).
create or replace function mark_no_show(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_before jsonb;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  if lower(v_booking.time_range) > now() then
    raise exception 'NOT_STARTED_YET' using errcode = 'P0001';
  end if;

  v_before := to_jsonb(v_booking);

  update bookings set status = 'no_show' where id = p_booking_id
  returning * into v_booking;

  if v_booking.booked_by is not null then
    update profiles set no_show_count = no_show_count + 1 where id = v_booking.booked_by;
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'booking_no_show', 'booking', v_booking.id, v_before, to_jsonb(v_booking));

  return v_booking;
end;
$$;

grant execute on function mark_no_show(uuid) to authenticated;

-- Extends create_booking with a manual booking-restriction check: an admin can set
-- profiles.booking_restricted_until on a member (spec 4.5's "restricts booking privileges").
-- This is the manual half only — automatically restricting after N no-shows in a rolling
-- window is Phase 4; here the admin decides when to apply/lift a restriction themselves.
create or replace function create_booking(
  p_court_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_party_size integer default 1,
  p_booked_by uuid default null,
  p_guest_name text default null,
  p_guest_phone text default null,
  p_source text default 'online',
  p_notes text default null,
  p_idempotency_key text default null,
  p_player_names text[] default '{}'
)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court courts;
  v_venue venues;
  v_time_range tstzrange;
  v_local_start time;
  v_local_end time;
  v_day_of_week smallint;
  v_rate_cents integer;
  v_total_cents integer;
  v_booking bookings;
  v_player_name text;
begin
  if p_duration_minutes is null or p_duration_minutes <= 0 or p_duration_minutes % 30 <> 0 then
    raise exception 'INVALID_DURATION' using errcode = 'P0001';
  end if;

  if p_booked_by is null and (p_guest_name is null or p_guest_phone is null) then
    raise exception 'GUEST_INFO_REQUIRED' using errcode = 'P0001';
  end if;

  -- Idempotency: a retried request with the same key returns the original booking untouched.
  if p_idempotency_key is not null then
    select * into v_booking from bookings where idempotency_key = p_idempotency_key;
    if found then
      return v_booking;
    end if;
  end if;

  if p_booked_by is not null and exists (
    select 1 from profiles
    where id = p_booked_by
      and booking_restricted_until is not null
      and booking_restricted_until > now()
  ) then
    raise exception 'BOOKING_RESTRICTED' using errcode = 'P0001';
  end if;

  select * into v_court from courts where id = p_court_id and is_active for share;
  if not found then
    raise exception 'COURT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_venue from venues where id = v_court.venue_id;

  if p_starts_at < now() + make_interval(mins => v_venue.min_lead_minutes) then
    raise exception 'LEAD_TIME_TOO_SHORT' using errcode = 'P0001';
  end if;

  if p_starts_at > now() + make_interval(days => v_venue.max_advance_days) then
    raise exception 'OUTSIDE_BOOKING_WINDOW' using errcode = 'P0001';
  end if;

  v_time_range := tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_duration_minutes), '[)');

  v_local_start := (p_starts_at at time zone v_venue.timezone)::time;
  v_local_end := ((p_starts_at + make_interval(mins => p_duration_minutes)) at time zone v_venue.timezone)::time;
  v_day_of_week := extract(dow from (p_starts_at at time zone v_venue.timezone));

  if v_local_end <= v_local_start then
    -- Booking would cross midnight in venue-local time; not supported in Phase 1.
    raise exception 'OUTSIDE_OPERATING_HOURS' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from operating_hours oh
    where oh.venue_id = v_venue.id
      and oh.day_of_week = v_day_of_week
      and oh.open_time <= v_local_start
      and oh.close_time >= v_local_end
  ) then
    raise exception 'OUTSIDE_OPERATING_HOURS' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from closures c
    where (c.court_id = p_court_id or (c.court_id is null and c.venue_id = v_venue.id))
      and tstzrange(c.starts_at, c.ends_at) && v_time_range
  ) then
    raise exception 'COURT_CLOSED' using errcode = 'P0001';
  end if;

  v_rate_cents := v_court.hourly_rate_cents;
  if p_booked_by is not null and v_court.member_rate_cents is not null and has_active_membership(p_booked_by) then
    v_rate_cents := v_court.member_rate_cents;
  end if;
  v_total_cents := round(v_rate_cents * p_duration_minutes / 60.0);

  insert into bookings (
    court_id, booked_by, guest_name, guest_phone, time_range, status,
    party_size, total_cents, payment_status, source, notes, idempotency_key
  ) values (
    p_court_id, p_booked_by, p_guest_name, p_guest_phone, v_time_range, 'confirmed',
    p_party_size, v_total_cents, 'pay_at_venue', p_source, p_notes, p_idempotency_key
  )
  returning * into v_booking;

  foreach v_player_name in array coalesce(p_player_names, '{}') loop
    insert into booking_players (booking_id, guest_name) values (v_booking.id, v_player_name);
  end loop;

  insert into booking_slots (booking_id, court_id, time_range)
  values (v_booking.id, p_court_id, v_time_range);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (p_booked_by, 'booking_created', 'booking', v_booking.id, to_jsonb(v_booking));

  return v_booking;
end;
$$;
