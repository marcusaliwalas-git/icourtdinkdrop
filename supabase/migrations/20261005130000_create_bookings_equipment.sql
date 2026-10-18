-- Add equipment rentals to the cart RPC. New p_equipment arg: [{equipment_id, quantity}]. Each item is
-- capacity-checked (stock − overlapping rentals) under a row lock on the equipment row, priced by the
-- cart's time span, recorded as a booking_equipment line, and added to the first booking's total — the
-- same atomic transaction as the coach add-on. See docs/equipment-rental-design.md.
--
-- v1 scope: equipment attaches to the whole cart (like the coach add-on), reserved + charged over the
-- cart's overall span [earliest start, latest end]. A non-contiguous cart over-reserves across the gap;
-- per-slot attachment can refine this later.
--
-- Single-overload invariant: drop the 15-arg signature, then create the 16-arg one.
drop function if exists create_bookings(jsonb, integer, uuid, text, text, text, text, text, text, text[], text, text, uuid, text, text);

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
  v_cart_start    timestamptz;
  v_cart_end      timestamptz;
  v_range         tstzrange;
  v_span_minutes  integer;
  v_eq_item       jsonb;
  v_eq            equipment;
  v_eq_qty        integer;
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

  -- Optional equipment rentals: each item capacity-checked under a row lock, priced by the cart's span.
  if p_equipment is not null and jsonb_typeof(p_equipment) = 'array' and jsonb_array_length(p_equipment) > 0 then
    v_range := tstzrange(v_cart_start, v_cart_end, '[)');
    v_span_minutes := greatest(1, (extract(epoch from (v_cart_end - v_cart_start)) / 60)::integer);
    for v_eq_item in select * from jsonb_array_elements(p_equipment)
    loop
      v_eq_qty := (v_eq_item ->> 'quantity')::integer;
      if v_eq_qty is null or v_eq_qty <= 0 then
        continue;
      end if;

      -- Lock the item row so concurrent carts can't oversell the same equipment.
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

      v_eq_fee := round(v_eq.hourly_rate_cents * v_eq_qty * v_span_minutes / 60.0);
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
