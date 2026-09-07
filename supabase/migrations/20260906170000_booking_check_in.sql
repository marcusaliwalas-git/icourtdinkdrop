-- Front-desk check-in: a lightweight "arrived" marker, separate from the booking status, so the
-- desk can tell a confirmed customer who has physically arrived from one still expected. Nullable
-- timestamp — set when checked in, cleared to undo a mistap.
alter table bookings add column checked_in_at timestamptz;

-- Toggle a booking's checked-in state. Admin of the booking's venue only. A customer must be
-- confirmed before check-in (the desk verifies payment via Confirm first); undo has no such gate.
create or replace function set_booking_checked_in(p_booking_id uuid, p_checked_in boolean)
returns bookings language plpgsql security definer set search_path = public as $$
declare
  v_booking bookings;
  v_before  jsonb;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;

  if not can_admin_venue(court_venue(v_booking.court_id)) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if p_checked_in and v_booking.status <> 'confirmed' then
    raise exception 'NOT_CONFIRMED' using errcode = 'P0001';
  end if;

  -- Idempotent: checking in an already-arrived booking (or undoing an already-cleared one) is a no-op.
  if (p_checked_in and v_booking.checked_in_at is not null)
     or (not p_checked_in and v_booking.checked_in_at is null) then
    return v_booking;
  end if;

  v_before := to_jsonb(v_booking);
  update bookings set checked_in_at = case when p_checked_in then now() else null end
    where id = p_booking_id returning * into v_booking;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(),
          case when p_checked_in then 'booking_checked_in' else 'booking_check_in_undone' end,
          'booking', p_booking_id, v_before, to_jsonb(v_booking));

  return v_booking;
end; $$;

revoke all on function set_booking_checked_in(uuid, boolean) from public;
grant execute on function set_booking_checked_in(uuid, boolean) to authenticated;
