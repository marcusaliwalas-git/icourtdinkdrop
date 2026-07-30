-- Guest checkout only ever collected name + phone (spec 4.1), so guests never received the
-- pending/confirmed booking emails — only members with an account do. Adds an optional
-- guest_email column so a guest can opt in to email notifications without making email a
-- required field (keeps the "book in under 60 seconds" guest flow frictionless).
alter table bookings add column guest_email text;

-- Adding a parameter changes create_booking's signature, so CREATE OR REPLACE would create a
-- second overload rather than truly replacing it (Postgres only replaces on an exact argument
-- match) — drop the old signature explicitly first to avoid two ambiguous overloads coexisting.
drop function if exists create_booking(uuid, timestamptz, integer, integer, uuid, text, text, text, text, text, text[]);

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
  v_crosses_day boolean;
  v_rate_cents integer;
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
  v_crosses_day := v_local_end <= v_local_start;

  if not v_crosses_day and not exists (
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

  v_initial_status := case when p_source = 'online' then 'pending' else 'confirmed' end;

  insert into bookings (
    court_id, booked_by, guest_name, guest_phone, guest_email, time_range, status,
    party_size, total_cents, payment_status, source, notes, idempotency_key
  ) values (
    p_court_id, p_booked_by, p_guest_name, p_guest_phone, p_guest_email, v_time_range, v_initial_status,
    p_party_size, v_total_cents, 'pay_at_venue', p_source, p_notes, p_idempotency_key
  )
  returning * into v_booking;

  foreach v_player_name in array coalesce(p_player_names, '{}') loop
    insert into booking_players (booking_id, guest_name) values (v_booking.id, v_player_name);
  end loop;

  -- booking_slots feeds the public availability grid; a pending booking still occupies the
  -- slot (nobody else should be able to grab it while it awaits admin review).
  insert into booking_slots (booking_id, court_id, time_range)
  values (v_booking.id, p_court_id, v_time_range);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (p_booked_by, 'booking_created', 'booking', v_booking.id, to_jsonb(v_booking));

  return v_booking;
end;
$$;

grant execute on function create_booking(
  uuid, timestamptz, integer, integer, uuid, text, text, text, text, text, text, text[]
) to anon, authenticated;
