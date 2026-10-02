-- Admin correction: void a booking that shouldn't count — a mistaken/duplicate entry, or a past
-- booking that needs removing after it has started. The normal Cancel is blocked once a booking
-- starts (ALREADY_STARTED) and is meant for a customer cancelling ahead of time; voiding is the
-- admin's after-the-fact correction. A voided booking is KEPT for the audit trail but excluded from
-- realized revenue (REALIZED_STATUSES in lib/sales.ts is confirmed/completed/no_show only) and from
-- the no_overlapping_bookings constraint (which applies only to confirmed/pending), so its slot is
-- freed. A reason is required and recorded in the audit log.
alter table bookings drop constraint bookings_status_check;
alter table bookings add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'voided'));

create or replace function void_booking(p_booking_id uuid, p_reason text)
returns bookings language plpgsql security definer set search_path = public as $$
declare
  v_booking bookings;
  v_before  jsonb;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;

  -- Admin of the booking's venue only. Unlike cancel_booking, this deliberately does NOT block a
  -- booking that has already started — voiding a past booking is the whole point.
  if not can_admin_venue(court_venue(v_booking.court_id)) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_booking.status = 'voided' then return v_booking; end if; -- idempotent

  v_before := to_jsonb(v_booking);
  update bookings set status = 'voided' where id = p_booking_id returning * into v_booking;
  -- Free the slot from the availability grid (harmless for a past slot; correct for a mistaken
  -- future one). The overlap constraint already ignores non-active statuses.
  delete from booking_slots where booking_id = p_booking_id;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'booking_voided', 'booking', p_booking_id,
          v_before, to_jsonb(v_booking) || jsonb_build_object('void_reason', btrim(p_reason)));

  return v_booking;
end; $$;

revoke all on function void_booking(uuid, text) from public;
grant execute on function void_booking(uuid, text) to authenticated;
