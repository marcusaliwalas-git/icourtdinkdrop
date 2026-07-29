create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  timezone text not null default 'Asia/Manila',
  contact text,
  photos text[] not null default '{}',
  amenities text[] not null default '{}',
  -- Admin-configurable booking rules (spec 4.3). Kept minimal for Phase 1:
  -- lead time and advance window are cheap to enforce and prevent bad data;
  -- peak/off-peak pricing and per-member weekly caps are deferred to a later phase.
  min_lead_minutes integer not null default 60 check (min_lead_minutes >= 0),
  max_advance_days integer not null default 14 check (max_advance_days > 0),
  cancellation_cutoff_hours integer not null default 3 check (cancellation_cutoff_hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger venues_set_updated_at
  before update on venues
  for each row
  execute function set_updated_at();

create table courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  name text not null,
  surface text,
  is_indoor boolean not null default false,
  hourly_rate_cents integer not null check (hourly_rate_cents >= 0),
  -- Nullable: falls back to hourly_rate_cents when a court has no discounted member rate.
  member_rate_cents integer check (member_rate_cents is null or member_rate_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index courts_venue_id_idx on courts (venue_id);

create trigger courts_set_updated_at
  before update on courts
  for each row
  execute function set_updated_at();

create table operating_hours (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  open_time time not null,
  close_time time not null,
  check (close_time > open_time)
);

create index operating_hours_venue_id_idx on operating_hours (venue_id);

create table closures (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  -- nullable court_id = whole-venue closure (e.g. a public holiday)
  court_id uuid references courts (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index closures_court_id_idx on closures (court_id);
create index closures_venue_id_idx on closures (venue_id);
create index closures_range_idx on closures using gist (tstzrange(starts_at, ends_at));
