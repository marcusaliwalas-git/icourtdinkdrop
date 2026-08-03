-- Manual payment verification: instead of an online payment gateway, a guest/member
-- transfers via GCash/bank, then submits a reference number + a photo/PDF of the receipt.
-- The booking still goes 'pending' exactly as before; the admin now has something concrete
-- to check (booking-action-sheet.tsx) before clicking the existing "Confirm booking" button —
-- no new booking status or admin workflow needed, just proof attached to the existing one.
alter table bookings
  add column payment_reference text,
  add column payment_slip_path text;

-- 'awaiting_verification': an online booking with a transfer reference + slip attached, not
-- yet checked by an admin. Distinguishing it from 'pay_at_venue' (walk-ins, cash at the
-- counter) matters for reporting even though both currently only gate on booking.status.
alter table bookings drop constraint if exists bookings_payment_status_check;
alter table bookings add constraint bookings_payment_status_check
  check (payment_status in (
    'pay_at_venue', 'paid_at_venue', 'awaiting_verification', 'paid_online',
    'refunded', 'partially_refunded'
  ));

-- Private bucket — nobody reads a slip except via a signed URL generated server-side with
-- the service-role client (see admin/calendar/actions.ts's getBookingPaymentProof), so there's
-- no "select" storage policy at all. Guests have no session, so uploading has to work for the
-- anon role; a random path (client generates a uuid filename) keeps slips unguessable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-slips', 'payment-slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);

create policy payment_slips_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'payment-slips');

-- create or replace only replaces a function whose parameter list matches exactly — adding
-- the two new trailing params below would otherwise leave the old 12-param version in place
-- as a second overload, and every existing named-parameter call site (this migration's own
-- test suite included) becomes ambiguous ("is not unique") since it doesn't mention the two
-- new params either way. Drop the old signature explicitly first.
drop function if exists create_booking(
  uuid, timestamptz, integer, integer, uuid, text, text, text, text, text, text, text[]
);

-- Requires payment proof for online bookings only (walk-ins are created by an admin who has
-- already seen the customer pay, or is collecting cash — see p_source = 'walkin' elsewhere in
-- this function). Mirrors the existing GUEST_INFO_REQUIRED check just above it.
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

  if p_source = 'online' and (p_payment_reference is null or p_payment_slip_path is null) then
    raise exception 'PAYMENT_PROOF_REQUIRED' using errcode = 'P0001';
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
  -- Deliberately not wrapped at 1440 (24h): a booking that would spill past local midnight
  -- ends up with v_local_end_minutes > 1440, which no close_time can ever satisfy, so it's
  -- rejected below rather than silently allowed.
  v_local_end_minutes := v_local_start_minutes + p_duration_minutes;

  if not exists (
    select 1 from operating_hours oh
    where oh.venue_id = v_venue.id
      and oh.day_of_week = v_day_of_week
      and extract(hour from oh.open_time) * 60 + extract(minute from oh.open_time) <= v_local_start_minutes
      and extract(hour from oh.close_time) * 60 + extract(minute from oh.close_time) >= v_local_end_minutes
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

  v_is_member := p_booked_by is not null and has_active_membership(p_booked_by);

  -- Sum each hour of the booking against the court's rate periods (peak/off-peak pricing),
  -- falling back to the court's flat rate for any hour no period covers. Ties between
  -- overlapping periods (a data-entry mistake, not a supported setup) resolve to whichever
  -- period starts latest, i.e. the more specific/narrower window.
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

  -- booking_slots feeds the public availability grid; a pending booking still occupies the
  -- slot (nobody else should be able to grab it while it awaits admin review).
  insert into booking_slots (booking_id, court_id, time_range)
  values (v_booking.id, p_court_id, v_time_range);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (p_booked_by, 'booking_created', 'booking', v_booking.id, to_jsonb(v_booking));

  return v_booking;
end;
$$;

-- Only a 'pending' booking can ever reach confirm_booking, and the only source that ever goes
-- 'pending' is 'online' (walk-ins are created already 'confirmed') — so every booking this
-- function confirms is, by construction, one with payment_reference/payment_slip_path already
-- set. An admin clicking "Confirm booking" now means "I checked the reference and slip", so
-- mark the payment verified in the same transaction rather than leaving it awaiting_verification
-- forever.
create or replace function confirm_booking(p_booking_id uuid)
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

  if v_booking.status <> 'pending' then
    raise exception 'NOT_PENDING' using errcode = 'P0001';
  end if;

  v_before := to_jsonb(v_booking);

  update bookings set status = 'confirmed', payment_status = 'paid_online' where id = p_booking_id
  returning * into v_booking;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'booking_confirmed', 'booking', v_booking.id, v_before, to_jsonb(v_booking));

  return v_booking;
end;
$$;
