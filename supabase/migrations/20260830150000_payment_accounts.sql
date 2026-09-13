-- Payment accounts a venue shows customers at booking time so they know where to transfer the
-- fee (GCash / bank). A venue can list several. Public-readable — a guest booking without an
-- account still needs to see them in the review step — and admin-managed, scoped to the venue.
create table payment_accounts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  remarks text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index payment_accounts_venue_id_idx on payment_accounts (venue_id);

alter table payment_accounts enable row level security;

-- Public catalog info, like operating_hours: anyone can read a venue's receiving accounts.
create policy payment_accounts_public_select on payment_accounts
  for select using (true);
-- Only the venue's own admins manage them.
create policy payment_accounts_admin_all on payment_accounts
  for all using (is_admin() and venue_id = current_user_venue())
  with check (is_admin() and venue_id = current_user_venue());
