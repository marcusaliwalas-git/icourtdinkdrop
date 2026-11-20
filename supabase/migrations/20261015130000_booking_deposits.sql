-- Downpayment / deposit support — opt-in per venue, additive, so venues and bookings without it are
-- untouched.
--
-- venues.deposit_percent: NULL = off (every venue defaults here). Set (e.g. 50) = customers may
--   reserve a booking by paying that percentage online, with the balance collected at the venue.
--
-- bookings.deposit_cents: NULL = a normal full-payment booking (existing behaviour). A value marks a
--   deposit booking and records how much is collected via the deposit, so the balance due at the
--   venue is total_cents - deposit_cents. Collecting the balance sets deposit_cents = total_cents.
alter table venues
  add column deposit_percent smallint
    check (deposit_percent is null or (deposit_percent between 1 and 99));

alter table bookings
  add column deposit_cents integer
    check (deposit_cents is null or deposit_cents >= 0);
