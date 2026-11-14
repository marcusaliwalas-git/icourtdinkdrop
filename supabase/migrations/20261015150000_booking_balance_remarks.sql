-- Optional bank & reference note for a deposit balance collected online (mirrors payment_remarks for
-- the original online payment). NULL for cash or no note.
alter table bookings
  add column balance_payment_remarks text;
