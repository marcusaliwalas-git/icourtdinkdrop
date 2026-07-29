create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  skill_level numeric(2, 1) check (skill_level is null or skill_level between 2.5 and 5.0),
  avatar_url text,
  role text not null default 'player' check (role in ('player', 'organizer', 'admin')),
  no_show_count integer not null default 0,
  booking_restricted_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row
  execute function set_updated_at();

-- SECURITY DEFINER: reads profiles.role for the current session without being blocked
-- by profiles' own RLS policies (which would otherwise recurse into this same check).
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_organizer_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('organizer', 'admin')
  );
$$;

-- Creates the profile row automatically whenever a new auth user signs up
-- (magic link, Google, or phone OTP), so the app never has to do it client-side.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- Prevents a non-admin from granting themselves a higher role via a direct profile update.
create or replace function guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only end-user sessions (the 'authenticated' JWT role) are restricted here; a
  -- service-role connection (seeding, admin scripts) already bypasses RLS entirely,
  -- so this guard would otherwise silently revert role changes made by trusted server code.
  if new.role is distinct from old.role and auth.role() = 'authenticated' and not is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role_change
  before update on profiles
  for each row
  execute function guard_profile_role_change();

create table memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  tier text not null,
  starts_on date not null,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at timestamptz not null default now()
);

create index memberships_profile_id_idx on memberships (profile_id);

-- Convenience check used by pricing/rules logic: does this profile currently have an active membership?
create or replace function has_active_membership(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from memberships
    where profile_id = p_profile_id
      and status = 'active'
      and starts_on <= current_date
      and (ends_on is null or ends_on >= current_date)
  );
$$;
