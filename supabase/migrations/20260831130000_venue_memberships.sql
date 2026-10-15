-- Multi-venue membership, Step 1 (additive foundation). Introduces a join table so one account can
-- belong to several venues, and backfills it from the current single-venue model. Nothing reads it
-- yet — this migration changes no behavior. See docs/multi-venue-membership-plan.md.

create table venue_memberships (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  venue_id    uuid not null references venues (id)   on delete cascade,
  role        text not null default 'player' check (role in ('player','organizer','admin')),
  created_at  timestamptz not null default now(),
  unique (profile_id, venue_id)
);
create index venue_memberships_profile_idx on venue_memberships (profile_id);
create index venue_memberships_venue_idx   on venue_memberships (venue_id);

-- Backfill one row per existing (person, venue) from the single-venue columns.
insert into venue_memberships (profile_id, venue_id, role)
  select id, venue_id, role from profiles where venue_id is not null
  on conflict (profile_id, venue_id) do nothing;

-- The paid tier becomes per-venue too; backfill from the member's current venue.
alter table memberships add column venue_id uuid references venues (id);
update memberships m set venue_id = p.venue_id
  from profiles p where p.id = m.profile_id and m.venue_id is null;

-- Membership helpers (SECURITY DEFINER so they read venue_memberships without recursing through its
-- own RLS). Defined now, used by policies at the Step 7 cutover.
create or replace function is_member_of(p_venue uuid) returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (
      select 1 from venue_memberships where profile_id = auth.uid() and venue_id = p_venue
    ) $$;

create or replace function is_admin_of(p_venue uuid) returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (
      select 1 from venue_memberships
      where profile_id = auth.uid() and venue_id = p_venue and role = 'admin'
    ) $$;

-- RLS on the new table: you see your own rows; an admin of a venue sees/manages that venue's rows.
alter table venue_memberships enable row level security;
create policy venue_memberships_select on venue_memberships
  for select using (profile_id = auth.uid() or is_admin_of(venue_id));
create policy venue_memberships_admin_write on venue_memberships
  for all using (is_admin_of(venue_id)) with check (is_admin_of(venue_id));
