-- Promotions: per-venue, data-driven discounts. A promo is a row (type + JSONB config + schedule);
-- the discount math lives in the TypeScript promo engine (src/lib/promos), which records its result
-- on the booking. Adding a new promo kind later is a new engine handler — no change to this schema.
-- See docs/promotions-design.md.

create table promotions (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues (id) on delete cascade,
  name        text not null,                       -- admin-facing label, shown on receipts
  type        text not null,                       -- engine registry key, e.g. 'volume_discount'
  config      jsonb not null default '{}'::jsonb,  -- type-specific params, validated in TS
  eligibility text not null default 'all'
              check (eligibility in ('all', 'members_only', 'guests_only')),
  stackable   boolean not null default false,      -- may combine with other stackable promos
  priority    integer not null default 0,          -- tiebreak when several apply (higher first)
  active      boolean not null default true,
  starts_on   date,                                -- optional campaign window (venue-local dates)
  ends_on     date,
  created_at  timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index promotions_venue_active_idx on promotions (venue_id) where active;

alter table promotions enable row level security;

-- Admins manage their own venue's promotions.
create policy promotions_admin_all on promotions
  for all using (can_admin_venue(venue_id)) with check (can_admin_venue(venue_id));

-- Active promotions are readable by anyone pricing the public booking page (they're not secret —
-- they show up as a discount line in the cart). Inactive/scheduled rows stay admin-only.
create policy promotions_public_read on promotions
  for select using (active);

-- Record the applied discount on each booking row (per court-slot, so per-court reporting stays
-- accurate). Mirrors the existing coach_fee_cents pattern.
alter table bookings
  add column discount_cents integer not null default 0 check (discount_cents >= 0),
  add column discount_label text,
  add column promotion_id   uuid references promotions (id);

-- Guardrail for the server-computed discount (see docs/promotions-design.md §7): the create_bookings
-- RPC caps a cart's total discount at this percentage of its base, so a tampered discount can't push
-- the price arbitrarily low. Null/absent = no cap beyond "can't go below zero".
alter table venues
  add column max_discount_pct integer check (max_discount_pct between 0 and 100);
