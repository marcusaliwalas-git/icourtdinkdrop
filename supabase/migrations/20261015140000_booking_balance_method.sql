-- Record how a deposit booking's balance was collected at the venue (cash or online). NULL = balance
-- not yet collected (or not a deposit booking). The deposit itself is always paid online; this is the
-- remainder settled in person.
alter table bookings
  add column balance_payment_method text
    check (balance_payment_method is null or balance_payment_method in ('cash', 'online'));
