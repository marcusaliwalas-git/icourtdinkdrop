-- Group a multi-slot cart so admins review it as one payment. create_bookings stamps a shared
-- booking_group_id on every slot; existing carts are backfilled by their shared idempotency-key
-- prefix. confirm_booking_group / cancel_booking_group act on the whole group in one transaction.
alter table bookings add column booking_group_id uuid;
create index bookings_group_idx on bookings (booking_group_id);

create or replace function create_bookings(
  p_segments          jsonb,
  p_party_size        integer default 1,
  p_booked_by         uuid    default null,
  p_guest_name        text    default null,
  p_guest_phone       text    default null,
  p_guest_email       text    default null,
  p_source            text    default 'online',
  p_notes             text    default null,
  p_idempotency_key   text    default null,
  p_player_names      text[]  default '{}',
  p_payment_reference text    default null,
  p_payment_slip_path text    default null,
  p_coach_id          uuid    default null
)
returns setof bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seg           jsonb;
  v_index         integer := 0;
  v_booking       bookings;
  v_ids           uuid[] := '{}';
  v_total_minutes integer := 0;
  v_coach         coaches;
  v_coach_fee     integer;
  v_group_id      uuid := gen_random_uuid();
begin
  if p_segments is null or jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) = 0 then
    raise exception 'NO_SEGMENTS' using errcode = 'P0001';
  end if;

  for v_seg in select * from jsonb_array_elements(p_segments)
  loop
    v_booking := create_booking(
      p_court_id          => (v_seg ->> 'court_id')::uuid,
      p_starts_at         => (v_seg ->> 'starts_at')::timestamptz,
      p_duration_minutes  => (v_seg ->> 'duration_minutes')::integer,
      p_party_size        => p_party_size,
      p_booked_by         => p_booked_by,
      p_guest_name        => p_guest_name,
      p_guest_phone       => p_guest_phone,
      p_guest_email       => p_guest_email,
      p_source            => p_source,
      p_notes             => p_notes,
      p_idempotency_key   => case when p_idempotency_key is null then null else p_idempotency_key || '-' || v_index end,
      p_player_names      => p_player_names,
      p_payment_reference => p_payment_reference,
      p_payment_slip_path => p_payment_slip_path
    );
    v_ids := v_ids || v_booking.id;
    v_total_minutes := v_total_minutes + (v_seg ->> 'duration_minutes')::integer;
    v_index := v_index + 1;
  end loop;

  -- Optional coaching add-on: one coach for the whole cart, charged per hour across all slots.
  if p_coach_id is not null then
    select * into v_coach from coaches where id = p_coach_id and is_active;
    if not found then
      raise exception 'COACH_NOT_FOUND' using errcode = 'P0001';
    end if;
    v_coach_fee := round(v_coach.hourly_rate_cents * v_total_minutes / 60.0);
    -- Tag every booking in the cart with the coach (so each slot shows it); record the fee on
    -- the first booking and fold it into that row's total, so realized revenue includes coaching.
    update bookings set coach_id = p_coach_id where id = any (v_ids);
    update bookings
      set coach_fee_cents = v_coach_fee, total_cents = total_cents + v_coach_fee
      where id = v_ids[1];
  end if;

  update bookings set booking_group_id = v_group_id where id = any (v_ids);

  return query select * from bookings where id = any (v_ids) order by array_position(v_ids, id);
end;
$$;

-- Backfill existing carts: bookings whose idempotency_key shares a "<key>-<n>" prefix are one cart.
with groups as (
  select regexp_replace(idempotency_key, '-[0-9]+$', '') as base, gen_random_uuid() as gid
  from bookings
  where idempotency_key ~ '-[0-9]+$'
  group by regexp_replace(idempotency_key, '-[0-9]+$', '')
)
update bookings b set booking_group_id = g.gid
from groups g
where b.booking_group_id is null
  and b.idempotency_key ~ '-[0-9]+$'
  and regexp_replace(b.idempotency_key, '-[0-9]+$', '') = g.base;

-- Confirm every pending booking in a group (one payment → one decision). Admin of the group's venue.
create or replace function confirm_booking_group(p_group_id uuid)
returns setof bookings language plpgsql security definer set search_path = public as $$
declare v_venue uuid; v_booking bookings; v_before jsonb; v_ids uuid[] := '{}';
begin
  select court_venue(b.court_id) into v_venue from bookings b where b.booking_group_id = p_group_id limit 1;
  if v_venue is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not can_admin_venue(v_venue) then raise exception 'NOT_AUTHORIZED' using errcode = 'P0001'; end if;

  for v_booking in select * from bookings where booking_group_id = p_group_id and status = 'pending' for update loop
    v_before := to_jsonb(v_booking);
    update bookings set status = 'confirmed', payment_status = 'paid_online' where id = v_booking.id returning * into v_booking;
    insert into audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'booking_confirmed', 'booking', v_booking.id, v_before, to_jsonb(v_booking));
    v_ids := v_ids || v_booking.id;
  end loop;

  return query select * from bookings where id = any (v_ids);
end; $$;

revoke all on function confirm_booking_group(uuid) from public;
grant execute on function confirm_booking_group(uuid) to authenticated;

-- Reject (cancel) every not-yet-started pending/confirmed booking in a group.
create or replace function cancel_booking_group(p_group_id uuid)
returns setof bookings language plpgsql security definer set search_path = public as $$
declare v_venue uuid; v_booking bookings; v_before jsonb; v_ids uuid[] := '{}';
begin
  select court_venue(b.court_id) into v_venue from bookings b where b.booking_group_id = p_group_id limit 1;
  if v_venue is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not can_admin_venue(v_venue) then raise exception 'NOT_AUTHORIZED' using errcode = 'P0001'; end if;

  for v_booking in select * from bookings
      where booking_group_id = p_group_id and status in ('pending', 'confirmed') and lower(time_range) > now()
      for update loop
    v_before := to_jsonb(v_booking);
    update bookings set status = 'cancelled' where id = v_booking.id returning * into v_booking;
    delete from booking_slots where booking_id = v_booking.id;
    insert into audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'booking_cancelled', 'booking', v_booking.id, v_before, to_jsonb(v_booking));
    v_ids := v_ids || v_booking.id;
  end loop;

  return query select * from bookings where id = any (v_ids);
end; $$;

revoke all on function cancel_booking_group(uuid) from public;
grant execute on function cancel_booking_group(uuid) to authenticated;
