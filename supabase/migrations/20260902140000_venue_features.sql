-- Per-venue capability flags, controlled by the platform super admin. A map of feature key →
-- boolean; an absent key (and the default '{}') means enabled, so existing venues keep every
-- capability until a super admin turns one off. Only a super admin may change this column.
alter table venues add column features jsonb not null default '{}'::jsonb;

-- Super-admin-only writer. SECURITY DEFINER so it can update any venue, but it re-checks the caller
-- is a super admin (auth.uid() is preserved through SECURITY DEFINER). The app also gates the UI
-- with requireSuperAdmin; this is the server-side backstop.
create or replace function set_venue_feature(p_venue uuid, p_key text, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_features jsonb;
begin
  if not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_key !~ '^[a-z][a-z0-9_]{0,40}$' then
    raise exception 'INVALID_KEY' using errcode = 'P0001';
  end if;
  update venues
     set features = jsonb_set(coalesce(features, '{}'::jsonb), array[p_key], to_jsonb(p_enabled))
   where id = p_venue
   returning features into v_features;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  return v_features;
end; $$;

revoke all on function set_venue_feature(uuid, text, boolean) from public;
grant execute on function set_venue_feature(uuid, text, boolean) to authenticated, service_role;

-- Lock the features column down: a venue admin can update their venue row (name, hero, footer…)
-- under the is_admin_of() policy, but must not be able to re-enable a capability the super admin
-- disabled. Block any change to features from a non-super-admin. (Only fires when features actually
-- changes, so ordinary venue edits are unaffected. The RPC above passes because auth.uid() there is
-- the super admin.)
create or replace function guard_venue_features() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.features is distinct from old.features
     and not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  return new;
end; $$;

create trigger venues_guard_features before update on venues
  for each row execute function guard_venue_features();
