-- Tables for Phase 3/4 features (sessions, waitlist, credits, notifications).
-- Created now so later phases are additive migrations rather than reshaping existing data;
-- RLS is enabled with no client-facing write policies, so they're inert until those phases
-- add the application logic and (where needed) policies to use them.

create table sessions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  format text not null check (format in ('open_play', 'challenge_court', 'clinic', 'tournament')),
  skill_min numeric(2, 1),
  skill_max numeric(2, 1),
  capacity integer not null check (capacity > 0),
  price_cents integer not null default 0 check (price_cents >= 0),
  courts_used uuid[] not null default '{}',
  host_id uuid references profiles (id),
  cover_image_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create trigger sessions_set_updated_at
  before update on sessions
  for each row
  execute function set_updated_at();

create table session_signups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  profile_id uuid references profiles (id),
  guest_name text,
  status text not null default 'confirmed' check (status in ('confirmed', 'waitlisted', 'cancelled')),
  paid boolean not null default false,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  check (profile_id is not null or guest_name is not null)
);

create index session_signups_session_id_idx on session_signups (session_id);

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  court_id uuid references courts (id),
  session_id uuid references sessions (id),
  profile_id uuid not null references profiles (id),
  desired_range tstzrange,
  position integer,
  notified_at timestamptz,
  claim_expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (court_id is not null or session_id is not null)
);

create index waitlist_court_id_idx on waitlist (court_id);
create index waitlist_session_id_idx on waitlist (session_id);

create table credits (
  profile_id uuid primary key references profiles (id) on delete cascade,
  balance_cents integer not null default 0 check (balance_cents >= 0),
  updated_at timestamptz not null default now()
);

create trigger credits_set_updated_at
  before update on credits
  for each row
  execute function set_updated_at();

create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  delta_cents integer not null,
  reason text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index credit_ledger_profile_id_idx on credit_ledger (profile_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id),
  channel text not null check (channel in ('email', 'sms', 'wa', 'telegram')),
  template text not null,
  payload jsonb not null default '{}',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_profile_id_idx on notifications (profile_id);
