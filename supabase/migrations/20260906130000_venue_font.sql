-- Per-venue font, chosen by the platform super admin (exactly like the theme). One of a curated
-- menu of Google fonts; the app applies it as <html data-font> and globals.css re-points the font
-- tokens so the whole tenant site (body + headings) renders in that face. 'default' is Geist.
alter table venues
  add column font text not null default 'default'
  check (font in ('default', 'poppins', 'sora', 'rubik', 'fraunces'));

-- Super-admin-only writer, mirroring set_venue_theme.
create or replace function set_venue_font(p_venue uuid, p_font text)
returns text language plpgsql security definer set search_path = public as $$
declare v_font text;
begin
  if not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_font not in ('default', 'poppins', 'sora', 'rubik', 'fraunces') then
    raise exception 'INVALID_FONT' using errcode = 'P0001';
  end if;
  update venues set font = p_font where id = p_venue returning font into v_font;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  return v_font;
end; $$;

revoke all on function set_venue_font(uuid, text) from public;
grant execute on function set_venue_font(uuid, text) to authenticated, service_role;

-- Extend the venues guard so a venue admin can't change font either — features, theme and font are
-- all super-admin-controlled. (Only fires when a guarded value actually changes, so ordinary venue
-- edits are unaffected; the RPCs pass because auth.uid() there is the super admin.)
create or replace function guard_venue_features() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.features is distinct from old.features
      or new.theme is distinct from old.theme
      or new.font is distinct from old.font)
     and not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  return new;
end; $$;
