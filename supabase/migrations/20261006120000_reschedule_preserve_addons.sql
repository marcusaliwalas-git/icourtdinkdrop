-- Reschedule: preserve a booking's add-ons (coach + equipment) when re-pricing for the new slot.
--
-- Before, reschedule_booking recomputed only the COURT price and floored it at the booking's old
-- total. Once a booking could carry a coach or equipment fee (both folded into total_cents), that was
-- wrong two ways:
--   * moving to a pricier court dropped the add-on fees (undercharge) — the new court price replaced
--     the whole total instead of being added to the kept add-ons;
--   * the floor at the old total made a same/cheaper court look like an unrefunded court difference,
--     when the gap was really the add-on fee.
-- Fix: new total = max(original court base, new court price) + add-ons, so the add-ons are always kept
-- and only the court portion is re-priced (never refunded on a cheaper slot). Also move the equipment
-- reservation window to the new slot so availability stays accurate.

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
  v_addons_cents integer; v_court_base_cents integer;
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

  -- Add-ons (coach + equipment) are charged for the booking's duration, which reschedule keeps
  -- unchanged — so they carry over as-is. Peel them off the old total to get the original COURT base.
  v_addons_cents := coalesce(v_booking.coach_fee_cents, 0)
    + coalesce((select sum(fee_cents) from booking_equipment where booking_id = p_booking_id), 0);
  v_court_base_cents := v_booking.total_cents + v_booking.discount_cents - v_addons_cents;

  -- Re-price only the court, never below its original base (so a cheaper slot isn't refunded and the
  -- forfeited promo isn't undercharged), then add the kept add-ons back on.
  v_final_total_cents := greatest(v_court_base_cents, v_new_total_cents) + v_addons_cents;
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
  -- Keep the equipment reservation aligned with the booking's new slot.
  update booking_equipment set time_range = v_new_range where booking_id = p_booking_id;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'booking_rescheduled', 'booking', v_booking.id, v_before, to_jsonb(v_booking));
  return v_booking;
end; $$;

grant execute on function reschedule_booking(uuid, uuid, timestamptz) to authenticated;
