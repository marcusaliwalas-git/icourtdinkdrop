-- Add Montserrat to the venue font menu.
alter table venues drop constraint venues_font_check;
alter table venues add constraint venues_font_check
  check (font in ('default', 'poppins', 'sora', 'rubik', 'fraunces', 'montserrat'));

-- Recreate the super-admin font setter with Montserrat allowed.
create or replace function set_venue_font(p_venue uuid, p_font text)
returns text language plpgsql security definer set search_path = public as $$
declare v_font text;
begin
  if not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_font not in ('default', 'poppins', 'sora', 'rubik', 'fraunces', 'montserrat') then
    raise exception 'INVALID_FONT' using errcode = 'P0001';
  end if;
  update venues set font = p_font where id = p_venue returning font into v_font;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  return v_font;
end; $$;
