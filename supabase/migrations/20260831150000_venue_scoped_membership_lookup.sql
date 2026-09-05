-- Multi-venue Step 4: venue-scoped paid membership. has_active_membership gains a venue argument
-- keyed on memberships.venue_id, so a member gets member pricing only where they hold a membership
-- (supporting per-venue memberships). Recreates create_booking to use it.

create or replace function has_active_membership(p_profile_id uuid, p_venue_id uuid) returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (
      select 1 from memberships
      where profile_id = p_profile_id
        and venue_id = p_venue_id
        and status = 'active'
        and starts_on <= current_date
        and (ends_on is null or ends_on >= current_date)
    ) $$;

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
  p_payment_slip_path text default null
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
  v_booking bookings;
  v_player_name text;
begin
  if p_duration_minutes is null or p_duration_minutes <= 0
     or p_duration_minutes % 60 <> 0 or p_duration_minutes > 1440 then
    raise exception 'INVALID_DURATION' using errcode = 'P0001';
  end if;

  if p_booked_by is null and (p_guest_name is null or p_guest_phone is null) then
    raise exception 'GUEST_INFO_REQUIRED' using errcode = 'P0001';
  end if;

  if p_source = 'online' and p_booked_by is null and p_guest_email is null then
    raise exception 'GUEST_EMAIL_REQUIRED' using errcode = 'P0001';
  end if;

  if p_source = 'online' and p_payment_slip_path is null then
    raise exception 'PAYMENT_PROOF_REQUIRED' using errcode = 'P0001';
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
    order by extract(hour from crp.start_time) * 60 + extract(minute from crp.start_time) desc
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

  insert into bookings (
    court_id, booked_by, guest_name, guest_phone, guest_email, time_range, status,
    party_size, total_cents, payment_status, source, notes, idempotency_key,
    payment_reference, payment_slip_path
  ) values (
    p_court_id, p_booked_by, p_guest_name, p_guest_phone, p_guest_email, v_time_range, v_initial_status,
    p_party_size, v_total_cents,
    case when p_source = 'online' then 'awaiting_verification' else 'pay_at_venue' end,
    p_source, p_notes, p_idempotency_key, p_payment_reference, p_payment_slip_path
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
