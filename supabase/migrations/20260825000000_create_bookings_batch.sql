-- Batch booking: create several bookings (multiple courts and/or non-contiguous time slots on
-- one day) in a single atomic call, so a cart is all-or-nothing. If any slot in the cart fails
-- validation or was just taken, the whole transaction rolls back and nothing is booked — the
-- customer is never charged for a partial cart.
--
-- This is a thin wrapper over create_booking: it calls it once per segment inside one function
-- (hence one transaction), so every rule create_booking enforces (lead time, operating hours,
-- closures, no-double-booking via the exclusion constraint, pricing, pending/confirmed status)
-- applies unchanged to each segment. Shared fields (party size, guest details, payment proof)
-- are applied to every booking in the cart.

create or replace function create_bookings(
  p_segments          jsonb,               -- [{ court_id, starts_at, duration_minutes }, ...]
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
  p_payment_slip_path text    default null
)
returns setof bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seg     jsonb;
  v_index   integer := 0;
  v_booking bookings;
begin
  if p_segments is null or jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) = 0 then
    raise exception 'NO_SEGMENTS' using errcode = 'P0001';
  end if;

  for v_seg in select * from jsonb_array_elements(p_segments)
  loop
    -- Per-segment idempotency key derived from the caller's key, so a retried submit returns
    -- the same bookings instead of creating duplicates (each create_booking is idempotent).
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
    v_index := v_index + 1;
    return next v_booking;
  end loop;

  return;
end;
$$;

grant execute on function create_bookings(
  jsonb, integer, uuid, text, text, text, text, text, text, text[], text, text
) to anon, authenticated;
