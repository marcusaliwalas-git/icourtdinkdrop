-- Multi-tenancy hardening: the admin booking RPCs are SECURITY DEFINER and bypass RLS, so they
-- get an explicit venue guard — an admin may only act on a booking in their own venue, and may
-- only reschedule onto a court in their own venue.

create or replace function confirm_booking(p_booking_id uuid)
returns bookings language plpgsql security definer set search_path = public as $$
declare v_booking bookings; v_before jsonb;
begin
  if not is_admin() then raise exception 'NOT_AUTHORIZED' using errcode = 'P0001'; end if;
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if court_venue(v_booking.court_id) is distinct from current_user_venue() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if v_booking.status <> 'pending' then raise exception 'NOT_PENDING' using errcode = 'P0001'; end if;

  v_before := to_jsonb(v_booking);
  update bookings set status = 'confirmed', payment_status = 'paid_online' where id = p_booking_id returning * into v_booking;
  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'booking_confirmed', 'booking', v_booking.id, v_before, to_jsonb(v_booking));
  return v_booking;
end; $$;

create or replace function mark_no_show(p_booking_id uuid)
returns bookings language plpgsql security definer set search_path = public as $$
declare v_booking bookings; v_before jsonb;
begin
  if not is_admin() then raise exception 'NOT_AUTHORIZED' using errcode = 'P0001'; end if;
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if court_venue(v_booking.court_id) is distinct from current_user_venue() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if v_booking.status <> 'confirmed' then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  if lower(v_booking.time_range) > now() then raise exception 'NOT_STARTED_YET' using errcode = 'P0001'; end if;

  v_before := to_jsonb(v_booking);
  update bookings set status = 'no_show' where id = p_booking_id returning * into v_booking;
  if v_booking.booked_by is not null then
    update profiles set no_show_count = no_show_count + 1 where id = v_booking.booked_by;
  end if;
  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'booking_no_show', 'booking', v_booking.id, v_before, to_jsonb(v_booking));
  return v_booking;
end; $$;

create or replace function cancel_booking(p_booking_id uuid, p_reference_code text default null)
returns bookings language plpgsql security definer set search_path = public as $$
declare v_booking bookings; v_before jsonb;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;

  -- An admin may cancel only their own venue's bookings; the booker (or holder of the reference
  -- code) may always cancel their own, regardless of tenant.
  if not (
    (is_admin() and court_venue(v_booking.court_id) = current_user_venue())
    or (v_booking.booked_by is not null and v_booking.booked_by = auth.uid())
    or (p_reference_code is not null and upper(p_reference_code) = v_booking.reference_code)
  ) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_booking.status = 'cancelled' then return v_booking; end if;
  if v_booking.status in ('completed', 'no_show') then raise exception 'ALREADY_FINAL' using errcode = 'P0001'; end if;
  if lower(v_booking.time_range) <= now() then raise exception 'ALREADY_STARTED' using errcode = 'P0001'; end if;

  v_before := to_jsonb(v_booking);
  update bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;
  delete from booking_slots where booking_id = v_booking.id;
  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'booking_cancelled', 'booking', v_booking.id, v_before, to_jsonb(v_booking));
  return v_booking;
end; $$;

create or replace function reschedule_booking(
  p_booking_id uuid, p_new_court_id uuid, p_new_starts_at timestamptz
)
returns bookings language plpgsql security definer set search_path = public as $$
declare
  v_booking bookings; v_before jsonb; v_court courts; v_venue venues;
  v_duration_minutes integer; v_new_range tstzrange; v_local_start time;
  v_local_start_minutes integer; v_local_end_minutes integer; v_day_of_week smallint;
  v_is_member boolean; v_hour_idx integer; v_segment_minutes integer;
  v_segment_rate_cents integer; v_new_total_cents integer; v_final_total_cents integer;
begin
  if not is_admin() then raise exception 'NOT_AUTHORIZED' using errcode = 'P0001'; end if;

  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if court_venue(v_booking.court_id) is distinct from current_user_venue() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_booking.status not in ('pending', 'confirmed') then raise exception 'CANNOT_RESCHEDULE' using errcode = 'P0001'; end if;
  if lower(v_booking.time_range) <= now() then raise exception 'ALREADY_STARTED' using errcode = 'P0001'; end if;
  if p_new_starts_at <= now() then raise exception 'LEAD_TIME_TOO_SHORT' using errcode = 'P0001'; end if;

  v_duration_minutes := (extract(epoch from (upper(v_booking.time_range) - lower(v_booking.time_range))) / 60)::integer;

  select * into v_court from courts where id = p_new_court_id and is_active for share;
  if not found then raise exception 'COURT_NOT_FOUND' using errcode = 'P0001'; end if;
  -- The destination court must belong to the admin's own venue too.
  if v_court.venue_id is distinct from current_user_venue() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  select * into v_venue from venues where id = v_court.venue_id;

  if p_new_starts_at > now() + make_interval(days => v_venue.max_advance_days) then
    raise exception 'OUTSIDE_BOOKING_WINDOW' using errcode = 'P0001';
  end if;

  v_new_range := tstzrange(p_new_starts_at, p_new_starts_at + make_interval(mins => v_duration_minutes), '[)');
  v_local_start := (p_new_starts_at at time zone v_venue.timezone)::time;
  v_day_of_week := extract(dow from (p_new_starts_at at time zone v_venue.timezone));
  v_local_start_minutes := extract(hour from v_local_start) * 60 + extract(minute from v_local_start);
  v_local_end_minutes := v_local_start_minutes + v_duration_minutes;

  if not exists (
    select 1 from operating_hours oh
    where oh.venue_id = v_venue.id and oh.day_of_week = v_day_of_week
      and extract(hour from oh.open_time) * 60 + extract(minute from oh.open_time) <= v_local_start_minutes
      and extract(hour from oh.close_time) * 60 + extract(minute from oh.close_time) >= v_local_end_minutes
  ) then raise exception 'OUTSIDE_OPERATING_HOURS' using errcode = 'P0001'; end if;

  if exists (
    select 1 from closures c
    where (c.court_id = p_new_court_id or (c.court_id is null and c.venue_id = v_venue.id))
      and tstzrange(c.starts_at, c.ends_at) && v_new_range
  ) then raise exception 'COURT_CLOSED' using errcode = 'P0001'; end if;

  if exists (
    select 1 from bookings b
    where b.id <> p_booking_id and b.court_id = p_new_court_id
      and b.status in ('confirmed', 'pending') and b.time_range && v_new_range
  ) then raise exception 'SLOT_TAKEN' using errcode = 'P0001'; end if;

  v_is_member := v_booking.booked_by is not null and has_active_membership(v_booking.booked_by);
  v_new_total_cents := 0;
  for v_hour_idx in 0..(v_duration_minutes / 60 - 1) loop
    v_segment_minutes := v_local_start_minutes + v_hour_idx * 60;
    select case when v_is_member and crp.member_rate_cents is not null then crp.member_rate_cents else crp.hourly_rate_cents end
      into v_segment_rate_cents
    from court_rate_periods crp
    where crp.court_id = p_new_court_id
      and extract(hour from crp.start_time) * 60 + extract(minute from crp.start_time) <= v_segment_minutes
      and extract(hour from crp.end_time) * 60 + extract(minute from crp.end_time) > v_segment_minutes
    order by extract(hour from crp.start_time) * 60 + extract(minute from crp.start_time) desc limit 1;
    if v_segment_rate_cents is null then
      v_segment_rate_cents := case when v_is_member and v_court.member_rate_cents is not null then v_court.member_rate_cents else v_court.hourly_rate_cents end;
    end if;
    v_new_total_cents := v_new_total_cents + v_segment_rate_cents;
  end loop;

  v_final_total_cents := greatest(v_booking.total_cents, v_new_total_cents);
  v_before := to_jsonb(v_booking);

  update bookings set court_id = p_new_court_id, time_range = v_new_range, total_cents = v_final_total_cents
  where id = p_booking_id returning * into v_booking;
  update booking_slots set court_id = p_new_court_id, time_range = v_new_range where booking_id = p_booking_id;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'booking_rescheduled', 'booking', v_booking.id, v_before, to_jsonb(v_booking));
  return v_booking;
end; $$;
