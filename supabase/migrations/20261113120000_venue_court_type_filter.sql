-- Per-venue toggle for the customer-facing court-type filter on the booking page.
-- Venues use a court's `surface` label to name its type (e.g. Pickleball, Tennis, Table tennis).
-- When this is on, /book shows filter chips built from those labels so customers can narrow the
-- grid to one type. Off (the default) hides the chips — existing venues are unaffected until a
-- venue admin turns it on from Admin → Courts.
alter table venues add column if not exists court_type_filter boolean not null default false;
