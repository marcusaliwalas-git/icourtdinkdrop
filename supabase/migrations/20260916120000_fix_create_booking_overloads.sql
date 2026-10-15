-- Fix: online bookings fail with "Something went wrong."
--
-- The payment-method work added parameters to create_booking via CREATE OR REPLACE. Postgres keys
-- functions by their argument signature, so adding parameters created NEW overloads instead of
-- replacing the function. Three versions ended up coexisting: the original 14-arg, a 15-arg
-- (+p_payment_method), and the current 16-arg (+p_payment_remarks).
--
-- The online booking paths (create_bookings, and the single-booking createBooking action) call
-- create_booking with the original 14 arguments. Because the 15- and 16-arg overloads give the
-- extra parameters defaults, a 14-argument call matches all three overloads → Postgres raises
-- "function create_booking(...) is not unique" and the booking fails. (Walk-ins pass the extra
-- args explicitly, so they matched the 16-arg version and kept working.)
--
-- Drop the two stale overloads, leaving only the current 16-arg version. Its defaults for
-- p_payment_method / p_payment_remarks mean every existing caller resolves to it unambiguously.
drop function if exists create_booking(
  uuid, timestamptz, integer, integer, uuid, text, text, text, text, text, text, text[], text, text
);
drop function if exists create_booking(
  uuid, timestamptz, integer, integer, uuid, text, text, text, text, text, text, text[], text, text, text
);
