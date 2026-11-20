-- Audit log visibility was keyed off the ACTOR's shared venue: admin_shares_venue_with(actor_id).
-- That silently dropped guest-created rows. An online guest booking has actor_id = null, and
-- admin_shares_venue_with(null) is false, so `booking_created` for guest bookings never appeared on
-- the Audit page — even though the booking belongs to the admin's own venue (the later
-- booking_confirmed, done by the admin, did show, which is why one booking looked like it had no
-- creation entry).
--
-- audit_log now carries a venue_id (derived by trigger from the entity), so scope visibility by the
-- ROW's venue instead of the actor. This shows every entry for the admin's venue(s) — guest actions
-- included — and matches how the Audit page already filters (.eq venue_id). Rows the trigger
-- couldn't map to a venue (venue_id null) aren't shown here; the page never queried them either.
alter policy audit_log_admin_select on audit_log
  using (can_admin_venue(venue_id));
