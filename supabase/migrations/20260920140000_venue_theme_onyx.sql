-- Add an eighth theme, "onyx" (Onyx Gold) — a near-black onyx ground with refined metallic gold as
-- the accent and champagne text, framed by faint gold hairline borders, drawn from the SUPRA
-- Pickleball Lounge logo (black field, thin gold linework).
alter table venues drop constraint venues_theme_check;
alter table venues add constraint venues_theme_check
  check (theme in ('default', 'ocean', 'sunset', 'grape', 'light', 'gold', 'hardcourt', 'onyx'));

-- Recreate the super-admin theme setter with the onyx option allowed.
create or replace function set_venue_theme(p_venue uuid, p_theme text)
returns text language plpgsql security definer set search_path = public as $$
declare v_theme text;
begin
  if not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_theme not in ('default', 'ocean', 'sunset', 'grape', 'light', 'gold', 'hardcourt', 'onyx') then
    raise exception 'INVALID_THEME' using errcode = 'P0001';
  end if;
  update venues set theme = p_theme where id = p_venue returning theme into v_theme;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  return v_theme;
end; $$;

revoke all on function set_venue_theme(uuid, text) from public;
grant execute on function set_venue_theme(uuid, text) to authenticated, service_role;
