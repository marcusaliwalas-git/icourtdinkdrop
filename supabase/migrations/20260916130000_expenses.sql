-- Per-venue expense tracking, so an admin can log costs and the Sales page can show net profit
-- (realized revenue − expenses). Venue-scoped and admin-only, gated in the app behind the
-- super-admin "expenses" capability flag. Amounts in integer cents like every other money column;
-- incurred_on is a plain date (expenses are day-level and line up with the Sales date-range filter).
create table expenses (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references venues (id) on delete cascade,
  incurred_on  date not null,
  amount_cents integer not null check (amount_cents >= 0),
  category     text not null check (category in (
    'rent', 'utilities', 'wages', 'maintenance', 'equipment', 'sports_equipment',
    'supplies', 'marketing', 'permits_fees', 'other'
  )),
  note         text,
  created_by   uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index expenses_venue_date_idx on expenses (venue_id, incurred_on);

alter table expenses enable row level security;

-- Financials are sensitive: only an admin of the venue can read or write its expenses.
create policy expenses_admin_read on expenses
  for select using (is_admin_of(venue_id));

create policy expenses_admin_write on expenses
  for all using (is_admin_of(venue_id)) with check (is_admin_of(venue_id));
