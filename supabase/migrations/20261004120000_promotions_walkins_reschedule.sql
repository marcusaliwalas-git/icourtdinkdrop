-- Promotions follow-ups:
--  1. Reschedule forfeits any promo discount cleanly (was leaving stale discount columns + losing the
--     discount from total_cents, since reschedule recomputes price from rates).
--  2. apply_group_promotions works off the booking ids in the payload instead of requiring a shared
--     booking_group_id, so single-court admin walk-ins (no group) can be discounted too. The p_group_id
--     argument is kept for signature stability but no longer used.

-- 1. Reschedule — recompute the price for the new slot, never go below the booking's ORIGINAL base
--    (total + any discount), and drop the promo (clear the discount columns). Re-evaluating a
--    time-window promo for the new slot would need the engine, so reschedule simply forfeits it.
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
  if not is_staff_anywhere() and not is_admin() then raise exception 'NOT_AUTHORIZED' using errcode = 'P0001'; end if;

  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not can_staff_venue(court_venue(v_booking.court_id)) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_booking.status not in ('pending', 'confirmed') then raise exception 'CANNOT_RESCHEDULE' using errcode = 'P0001'; end if;
  if lower(v_booking.time_range) <= now() then raise exception 'ALREADY_STARTED' using errcode = 'P0001'; end if;
  if p_new_starts_at <= now() then raise exception 'LEAD_TIME_TOO_SHORT' using errcode = 'P0001'; end if;

  v_duration_minutes := (extract(epoch from (upper(v_booking.time_range) - lower(v_booking.time_range))) / 60)::integer;

  select * into v_court from courts where id = p_new_court_id and is_active for share;
  if not found then raise exception 'COURT_NOT_FOUND' using errcode = 'P0001'; end if;
  if not can_staff_venue(v_court.venue_id) then
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

  -- Floor at the ORIGINAL base (current total + any discount), so forfeiting the promo never undercharges
  -- and rescheduling to a cheaper slot never refunds.
  v_final_total_cents := greatest(v_booking.total_cents + v_booking.discount_cents, v_new_total_cents);
  v_before := to_jsonb(v_booking);

  update bookings set
      court_id = p_new_court_id,
      time_range = v_new_range,
      total_cents = v_final_total_cents,
      discount_cents = 0,
      discount_label = null,
      promotion_id = null
  where id = p_booking_id returning * into v_booking;
  update booking_slots set court_id = p_new_court_id, time_range = v_new_range where booking_id = p_booking_id;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'booking_rescheduled', 'booking', v_booking.id, v_before, to_jsonb(v_booking));
  return v_booking;
end; $$;

grant execute on function reschedule_booking(uuid, uuid, timestamptz) to authenticated;

-- 2. Record promo discounts by booking id (group-agnostic), so single-court walk-ins work too.
--    Validates each discount against a real active promo for that booking's venue, caps it at the
--    booking total, skips already-discounted bookings (idempotent), and enforces venues.max_discount_pct.
create or replace function apply_group_promotions(p_group_id uuid, p_discounts jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_d        jsonb;
  v_booking  bookings;
  v_promo    promotions;
  v_venue    uuid;
  v_base_sum integer := 0;
  v_disc_sum integer := 0;
  v_max_pct  integer;
  v_cents    integer;
  v_first_venue uuid;
begin
  if p_discounts is null or jsonb_typeof(p_discounts) <> 'array' or jsonb_array_length(p_discounts) = 0 then
    return;
  end if;

  for v_d in select * from jsonb_array_elements(p_discounts)
  loop
    v_cents := (v_d ->> 'cents')::integer;
    if v_cents is null or v_cents <= 0 then
      continue;
    end if;

    select * into v_booking from bookings where id = (v_d ->> 'booking_id')::uuid for update;
    if not found or v_booking.promotion_id is not null then
      continue; -- unknown booking, or already discounted
    end if;

    v_venue := court_venue(v_booking.court_id);
    if v_first_venue is null then v_first_venue := v_venue; end if;

    select * into v_promo from promotions
      where id = (v_d ->> 'promotion_id')::uuid and venue_id = v_venue and active;
    if not found then
      raise exception 'PROMO_INVALID' using errcode = 'P0001';
    end if;

    v_cents := least(v_cents, v_booking.total_cents); -- never below zero
    update bookings
      set discount_cents = v_cents,
          discount_label = coalesce(nullif(v_d ->> 'label', ''), v_promo.name),
          promotion_id   = v_promo.id,
          total_cents    = total_cents - v_cents
      where id = v_booking.id;

    v_disc_sum := v_disc_sum + v_cents;
    v_base_sum := v_base_sum + v_booking.total_cents; -- v_booking holds the pre-update (base) total
  end loop;

  -- Guardrail: the batch's total discount can't exceed the venue's configured percentage of base.
  if v_first_venue is not null then
    select max_discount_pct into v_max_pct from venues where id = v_first_venue;
    if v_max_pct is not null and v_disc_sum > round(v_base_sum * v_max_pct / 100.0) then
      raise exception 'DISCOUNT_EXCEEDS_CAP' using errcode = 'P0001';
    end if;
  end if;
end;
$function$;

revoke all on function apply_group_promotions(uuid, jsonb) from public;
grant execute on function apply_group_promotions(uuid, jsonb) to anon, authenticated, service_role;
