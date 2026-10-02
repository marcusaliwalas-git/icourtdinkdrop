-- Follow-up to 20260904170000: that migration relaxed create_booking to require only a guest name,
-- but the table CHECK still demanded name AND phone — so a name-only guest booking failed at insert
-- with a raw constraint error. Relax the constraint to match: a booking needs a booker or a guest name.
alter table bookings drop constraint bookings_check;
alter table bookings add constraint bookings_check
  check (booked_by is not null or guest_name is not null);
