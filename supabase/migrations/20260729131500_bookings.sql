create table bookings (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts (id),
  -- Member booking: booked_by set. Guest checkout (spec 4.1): booked_by null, guest_name/guest_phone set instead.
  booked_by uuid references profiles (id),
  guest_name text,
  guest_phone text,
  -- Short code shown on the confirmation screen (QR / booking reference, spec 4.3) and used
  -- to authorize guest self-service cancellation since guests have no session to check ownership against.
  reference_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  time_range tstzrange not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  party_size integer not null default 1 check (party_size >= 1),
  -- Always computed server-side from the court rate + membership status. Never trust a client-supplied price.
  total_cents integer not null check (total_cents >= 0),
  -- Phase 1 only produces 'pay_at_venue' / 'paid_at_venue'; the wider set of values avoids
  -- a constraint migration when Phase 2 adds real online payments and refunds.
  payment_status text not null default 'pay_at_venue'
    check (payment_status in ('pay_at_venue', 'paid_at_venue', 'paid_online', 'refunded', 'partially_refunded')),
  source text not null default 'online' check (source in ('online', 'walkin', 'admin')),
  notes text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (booked_by is not null or (guest_name is not null and guest_phone is not null))
);

create index bookings_court_id_idx on bookings (court_id);
create index bookings_booked_by_idx on bookings (booked_by);
create index bookings_time_range_idx on bookings using gist (time_range);
create unique index bookings_idempotency_key_idx on bookings (idempotency_key) where idempotency_key is not null;

create trigger bookings_set_updated_at
  before update on bookings
  for each row
  execute function set_updated_at();

-- Non-negotiable: the database, not application code, is the source of truth for no double-booking.
alter table bookings add constraint no_overlapping_bookings
  exclude using gist (
    court_id with =,
    time_range with &&
  ) where (status in ('confirmed', 'pending'));

create table booking_players (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  profile_id uuid references profiles (id),
  guest_name text,
  has_paid boolean not null default false,
  share_cents integer check (share_cents is null or share_cents >= 0),
  created_at timestamptz not null default now(),
  check (profile_id is not null or guest_name is not null)
);

create index booking_players_booking_id_idx on booking_players (booking_id);
create index booking_players_profile_id_idx on booking_players (profile_id);

-- Narrow, PII-free projection of bookings (court + time range only — no guest name/phone,
-- no price, no notes) so the public availability grid can be realtime-subscribed without
-- leaking anyone's booking details (spec 5: "a player can only read their own bookings").
-- Maintained exclusively by create_booking/cancel_booking, never written to directly.
create table booking_slots (
  booking_id uuid primary key references bookings (id) on delete cascade,
  court_id uuid not null references courts (id),
  time_range tstzrange not null
);

create index booking_slots_court_id_idx on booking_slots (court_id);
create index booking_slots_time_range_idx on booking_slots using gist (time_range);

-- Required for the availability grid's realtime subscription to receive INSERT/DELETE
-- events on this table (Supabase Realtime only broadcasts tables added to this publication).
alter publication supabase_realtime add table booking_slots;
