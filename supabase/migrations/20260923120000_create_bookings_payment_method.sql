-- Let a multi-slot cart record how it was paid, so admin batch walk-ins (open-play sessions booked
-- across several courts at once) can settle at creation the same way a single walk-in does. Adds
-- p_payment_method + p_payment_remarks, passed through to create_booking per segment. Customer online
-- carts call it without these (they stay awaiting_verification), so their behaviour is unchanged.
--
-- Drop the old 13-arg signature first so we REPLACE it rather than create a second overload — the
-- ambiguous-overload bug that once broke online booking. There must be exactly one create_bookings.
drop function if exists create_bookings(jsonb, integer, uuid, text, text, text, text, text, text, text[], text, text, uuid);

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
  p_payment_remarks text default null
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

  update bookings set booking_group_id = v_group_id where id = any (v_ids);

  return query select * from bookings where id = any (v_ids) order by array_position(v_ids, id);
end;
$function$;

revoke all on function create_bookings(jsonb, integer, uuid, text, text, text, text, text, text, text[], text, text, uuid, text, text) from public;
grant execute on function create_bookings(jsonb, integer, uuid, text, text, text, text, text, text, text[], text, text, uuid, text, text) to anon, authenticated, service_role;
