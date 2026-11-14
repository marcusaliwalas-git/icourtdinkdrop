-- Track HOW a booking was paid (cash / GCash / bank transfer), distinct from payment_status (WHETHER
-- it's paid). Mainly for walk-ins: the admin records the method at the counter so the owner can
-- reconcile the cash drawer against e-wallet/bank takings. Nullable — every existing booking stays
-- valid and simply has no recorded method.
alter table bookings
  add column payment_method text
  check (payment_method is null or payment_method in ('cash', 'gcash', 'bank_transfer'));

-- Recreated from 20260915140000's predecessor (20260915120000_rate_period_days_of_week.sql) with a
-- new p_payment_method: when a method is given (a walk-in paid at the counter) the booking is
-- created 'paid_at_venue' and the method is stored; online bookings are unchanged (they still go
-- through the slip-upload + admin-verification flow and pass no method here).
create or replace function create_booking(
  p_court_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_party_size integer default 1,
  p_booked_by uuid default null,
  p_guest_name text default null,
  p_guest_phone text default null,
  p_guest_email text default null,
  p_source text default 'online',
  p_notes text default null,
  p_idempotency_key text default null,
  p_player_names text[] default '{}',
  p_payment_reference text default null,
  p_payment_slip_path text default null,
  p_payment_method text default null
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
  v_local_start_minutes integer;
  v_local_end_minutes integer;
  v_day_of_week smallint;
  v_is_member boolean;
  v_hour_idx integer;
  v_segment_minutes integer;
  v_segment_rate_cents integer;
  v_total_cents integer;
  v_initial_status text;
  v_payment_status text;
  v_booking bookings;
  v_player_name text;
begin
  if p_duration_minutes is null or p_duration_minutes <= 0
     or p_duration_minutes % 60 <> 0 or p_duration_minutes > 1440 then
    raise exception 'INVALID_DURATION' using errcode = 'P0001';
  end if;

  if p_booked_by is null and p_guest_name is null then
    raise exception 'GUEST_INFO_REQUIRED' using errcode = 'P0001';
  end if;

  if p_source = 'online' and p_booked_by is null and p_guest_email is null then
    raise exception 'GUEST_EMAIL_REQUIRED' using errcode = 'P0001';
  end if;

  if p_source = 'online' and p_payment_slip_path is null then
    raise exception 'PAYMENT_PROOF_REQUIRED' using errcode = 'P0001';
  end if;

  if p_payment_method is not null and p_payment_method not in ('cash', 'gcash', 'bank_transfer') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = 'P0001';
  end if;

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

  if p_source <> 'walkin' and p_starts_at < now() + make_interval(mins => v_venue.min_lead_minutes) then
    raise exception 'LEAD_TIME_TOO_SHORT' using errcode = 'P0001';
  end if;

  if p_starts_at > now() + make_interval(days => v_venue.max_advance_days) then
    raise exception 'OUTSIDE_BOOKING_WINDOW' using errcode = 'P0001';
  end if;

  v_time_range := tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_duration_minutes), '[)');

  v_local_start := (p_starts_at at time zone v_venue.timezone)::time;
  v_day_of_week := extract(dow from (p_starts_at at time zone v_venue.timezone));
  v_local_start_minutes := extract(hour from v_local_start) * 60 + extract(minute from v_local_start);
  v_local_end_minutes := v_local_start_minutes + p_duration_minutes;

  -- The booking must fit inside one operating-hours session. Two interpretations are tried:
  --   offset 0    → the session opened on the booking's own weekday (a normal or late-evening slot);
  --   offset 1440 → the booking is the early-morning tail of the PREVIOUS day's overnight session,
  --                 so shift its minutes forward a day and match that day's row (only if it closes
  --                 next day). A row's effective close adds 1440 when it spills past midnight.
  if not exists (
    select 1
    from operating_hours oh
    cross join (values (0), (1440)) as interp(offset_min)
    where oh.venue_id = v_venue.id
      and oh.day_of_week = case when interp.offset_min = 0
            then v_day_of_week
            else (v_day_of_week + 6) % 7 end
      and (interp.offset_min = 0 or oh.closes_next_day)
      and (extract(hour from oh.open_time) * 60 + extract(minute from oh.open_time))
            <= v_local_start_minutes + interp.offset_min
      and (extract(hour from oh.close_time) * 60 + extract(minute from oh.close_time)
            + case when oh.closes_next_day then 1440 else 0 end)
            >= v_local_end_minutes + interp.offset_min
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

  v_is_member := p_booked_by is not null and has_active_membership(p_booked_by, v_court.venue_id);

  -- Sum each hour of the booking against the court's rate periods, honouring both the time-of-day
  -- window and the optional day-of-week scope. On a day two periods both cover, the day-scoped one
  -- wins over an all-days one; otherwise the narrower (later-starting) time window wins. Falls back
  -- to the court's flat rate for any hour no period covers.
  v_total_cents := 0;
  for v_hour_idx in 0..(p_duration_minutes / 60 - 1) loop
    v_segment_minutes := v_local_start_minutes + v_hour_idx * 60;

    select
      case when v_is_member and crp.member_rate_cents is not null
        then crp.member_rate_cents
        else crp.hourly_rate_cents
      end
    into v_segment_rate_cents
    from court_rate_periods crp
    where crp.court_id = p_court_id
      and extract(hour from crp.start_time) * 60 + extract(minute from crp.start_time) <= v_segment_minutes
      and extract(hour from crp.end_time) * 60 + extract(minute from crp.end_time) > v_segment_minutes
      and (crp.days_of_week is null or cardinality(crp.days_of_week) = 0
           or v_day_of_week = any (crp.days_of_week))
    order by
      (crp.days_of_week is not null and cardinality(crp.days_of_week) > 0) desc,
      extract(hour from crp.start_time) * 60 + extract(minute from crp.start_time) desc
    limit 1;

    if v_segment_rate_cents is null then
      v_segment_rate_cents := case when v_is_member and v_court.member_rate_cents is not null
        then v_court.member_rate_cents
        else v_court.hourly_rate_cents
      end;
    end if;

    v_total_cents := v_total_cents + v_segment_rate_cents;
  end loop;

  v_initial_status := case when p_source = 'online' then 'pending' else 'confirmed' end;

  -- Online bookings await payment verification; a walk-in with a recorded method was paid at the
  -- counter (paid_at_venue); a walk-in without one is still to be paid at the venue.
  v_payment_status := case
    when p_source = 'online' then 'awaiting_verification'
    when p_payment_method is not null then 'paid_at_venue'
    else 'pay_at_venue'
  end;

  insert into bookings (
    court_id, booked_by, guest_name, guest_phone, guest_email, time_range, status,
    party_size, total_cents, payment_status, source, notes, idempotency_key,
    payment_reference, payment_slip_path, payment_method
  ) values (
    p_court_id, p_booked_by, p_guest_name, p_guest_phone, p_guest_email, v_time_range, v_initial_status,
    p_party_size, v_total_cents, v_payment_status,
    p_source, p_notes, p_idempotency_key, p_payment_reference, p_payment_slip_path, p_payment_method
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
