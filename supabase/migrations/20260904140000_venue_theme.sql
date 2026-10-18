-- Per-venue theme, chosen by the platform super admin (like the capability flags). One of four
-- palettes; the app applies it as <html data-theme> and globals.css re-skins the design tokens.
alter table venues
  add column theme text not null default 'default'
  check (theme in ('default', 'ocean', 'sunset', 'grape'));

-- Super-admin-only writer, mirroring set_venue_feature.
create or replace function set_venue_theme(p_venue uuid, p_theme text)
returns text language plpgsql security definer set search_path = public as $$
declare v_theme text;
begin
  if not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_theme not in ('default', 'ocean', 'sunset', 'grape') then
    raise exception 'INVALID_THEME' using errcode = 'P0001';
  end if;
  update venues set theme = p_theme where id = p_venue returning theme into v_theme;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  return v_theme;
end; $$;

revoke all on function set_venue_theme(uuid, text) from public;
grant execute on function set_venue_theme(uuid, text) to authenticated, service_role;

-- Extend the existing venues guard so a venue admin can't change theme either — both features and
-- theme are super-admin-controlled. (Only fires when the value actually changes, so ordinary venue
-- edits are unaffected; the RPCs pass because auth.uid() there is the super admin.)
create or replace function guard_venue_features() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.features is distinct from old.features or new.theme is distinct from old.theme)
     and not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  return new;
end; $$;
