-- Multi-tenancy foundation — a venue IS a tenant. The deployment resolves the tenant from the
-- hostname (a `slug` subdomain like acme.dinkdrop.live, or a mapped `custom_domain`), and every
-- account belongs to exactly one venue (accounts are isolated per tenant).
--
-- This migration is ADDITIVE groundwork: it adds the tenant identity + the RLS anchor, but does
-- NOT yet change any policy, so existing single-tenant behaviour is unchanged and no isolation is
-- enforced until the follow-up RLS phase lands. Inert on its own, like the Phase 3 groundwork.

-- ── Tenant identity for hostname resolution ───────────────────────────────────
alter table venues
  add column slug text unique,
  add column custom_domain text unique;

-- ── Each account belongs to one venue ─────────────────────────────────────────
alter table profiles
  add column venue_id uuid references venues (id);

create index profiles_venue_id_idx on profiles (venue_id);

-- ── Backfill: the current single venue becomes tenant #1; every existing user joins it ────
do $$
declare v_id uuid;
begin
  select id into v_id from venues order by created_at asc limit 1;
  if v_id is not null then
    update venues set slug = coalesce(slug, 'default') where id = v_id;
    update profiles set venue_id = v_id where venue_id is null;
  end if;
end $$;

-- ── The RLS anchor: the authenticated caller's venue ──────────────────────────
-- Every tenant-scoped policy (added in the follow-up phase) will compare a row's venue against
-- this. SECURITY DEFINER so it reads profiles without recursing through profiles' own RLS.
create or replace function current_user_venue()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select venue_id from profiles where id = auth.uid()
$$;

-- ── New signups are tagged with the venue the app resolved from the hostname ───
-- The signup flow passes the resolved venue id in the user's metadata; a member therefore lands
-- in exactly the tenant whose site they signed up on.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name, phone, venue_id)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone'),
    nullif(new.raw_user_meta_data ->> 'venue_id', '')::uuid
  );
  return new;
end;
$$;
