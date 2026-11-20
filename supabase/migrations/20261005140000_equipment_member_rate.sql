-- Equipment: an optional member rate (like courts.member_rate_cents). When set and the booker is an
-- active member, equipment is charged at the member rate; otherwise the standard rate.

alter table equipment
  add column member_hourly_rate_cents integer
    check (member_hourly_rate_cents is null or member_hourly_rate_cents >= 0);

-- Availability feed now returns both rates so the booking UI can show the member price to members.
drop function if exists equipment_availability(uuid, tstzrange);
create or replace function equipment_availability(p_venue uuid, p_range tstzrange)
returns table (
  id uuid,
  name text,
  hourly_rate_cents integer,
  member_hourly_rate_cents integer,
  max_per_booking integer,
  available integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.id, e.name, e.hourly_rate_cents, e.member_hourly_rate_cents, e.max_per_booking,
         (e.stock - equipment_rented_qty(e.id, p_range))::int as available
  from equipment e
  where e.venue_id = p_venue and e.is_active
  order by e.sort_order, e.name
$function$;
revoke all on function equipment_availability(uuid, tstzrange) from public;
grant execute on function equipment_availability(uuid, tstzrange) to anon, authenticated, service_role;

-- create_bookings: price equipment at the member rate when the cart's booker is an active member.
create or replace function create_bookings(
  p_segments jsonb,
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
  p_coach_id uuid default null,
  p_payment_method text default null,
  p_payment_remarks text default null,
  p_equipment jsonb default '[]'
)
returns setof bookings
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_seg           jsonb;
  v_index         integer := 0;
  v_booking       bookings;
  v_ids           uuid[] := '{}';
  v_total_minutes integer := 0;
  v_coach         coaches;
  v_coach_fee     integer;
  v_group_id      uuid := gen_random_uuid();
  v_venue         uuid;
  v_is_member     boolean := false;
  v_cart_start    timestamptz;
  v_cart_end      timestamptz;
  v_range         tstzrange;
  v_span_minutes  integer;
  v_eq_item       jsonb;
  v_eq            equipment;
  v_eq_qty        integer;
  v_eq_rate       integer;
  v_eq_fee        integer;
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
      p_payment_slip_path => p_payment_slip_path,
      p_payment_method    => p_payment_method,
      p_payment_remarks   => p_payment_remarks
    );
    v_ids := v_ids || v_booking.id;
    v_total_minutes := v_total_minutes + (v_seg ->> 'duration_minutes')::integer;
    v_venue := court_venue(v_booking.court_id);
    v_is_member := v_booking.booked_as_member; -- same booker across the cart
    v_cart_start := least(v_cart_start, lower(v_booking.time_range));
    v_cart_end := greatest(v_cart_end, upper(v_booking.time_range));
    v_index := v_index + 1;
  end loop;

  -- Optional coaching add-on: one coach for the whole cart, charged per hour across all slots.
  if p_coach_id is not null then
    select * into v_coach from coaches where id = p_coach_id and is_active;
    if not found then
      raise exception 'COACH_NOT_FOUND' using errcode = 'P0001';
    end if;
    v_coach_fee := round(v_coach.hourly_rate_cents * v_total_minutes / 60.0);
    update bookings set coach_id = p_coach_id where id = any (v_ids);
    update bookings
      set coach_fee_cents = v_coach_fee, total_cents = total_cents + v_coach_fee
      where id = v_ids[1];
  end if;

  -- Optional equipment rentals: capacity-checked under a row lock, priced by the cart's span, at the
  -- member rate when the booker is an active member and the item has one.
  if p_equipment is not null and jsonb_typeof(p_equipment) = 'array' and jsonb_array_length(p_equipment) > 0 then
    v_range := tstzrange(v_cart_start, v_cart_end, '[)');
    v_span_minutes := greatest(1, (extract(epoch from (v_cart_end - v_cart_start)) / 60)::integer);
    for v_eq_item in select * from jsonb_array_elements(p_equipment)
    loop
      v_eq_qty := (v_eq_item ->> 'quantity')::integer;
      if v_eq_qty is null or v_eq_qty <= 0 then
        continue;
      end if;

      select * into v_eq from equipment
        where id = (v_eq_item ->> 'equipment_id')::uuid and venue_id = v_venue and is_active
        for update;
      if not found then
        raise exception 'EQUIPMENT_NOT_FOUND' using errcode = 'P0001';
      end if;
      if v_eq.max_per_booking is not null and v_eq_qty > v_eq.max_per_booking then
        raise exception 'EQUIPMENT_LIMIT' using errcode = 'P0001';
      end if;
      if v_eq_qty + equipment_rented_qty(v_eq.id, v_range) > v_eq.stock then
        raise exception 'EQUIPMENT_UNAVAILABLE' using errcode = 'P0001';
      end if;

      v_eq_rate := case
        when v_is_member and v_eq.member_hourly_rate_cents is not null then v_eq.member_hourly_rate_cents
        else v_eq.hourly_rate_cents
      end;
      v_eq_fee := round(v_eq_rate * v_eq_qty * v_span_minutes / 60.0);
      insert into booking_equipment (booking_id, equipment_id, quantity, time_range, fee_cents)
        values (v_ids[1], v_eq.id, v_eq_qty, v_range, v_eq_fee);
      update bookings set total_cents = total_cents + v_eq_fee where id = v_ids[1];
    end loop;
  end if;

  update bookings set booking_group_id = v_group_id where id = any (v_ids);

  return query select * from bookings where id = any (v_ids) order by array_position(v_ids, id);
end;
$function$;

revoke all on function create_bookings(jsonb, integer, uuid, text, text, text, text, text, text, text[], text, text, uuid, text, text, jsonb) from public;
grant execute on function create_bookings(jsonb, integer, uuid, text, text, text, text, text, text, text[], text, text, uuid, text, text, jsonb) to anon, authenticated, service_role;
