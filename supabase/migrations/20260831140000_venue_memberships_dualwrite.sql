-- Multi-venue Step 2: dual-write. A new signup (venue_id in metadata) now also gets a
-- venue_memberships row, alongside the existing profiles.venue_id. Both stay in sync from here.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue uuid := nullif(new.raw_user_meta_data ->> 'venue_id', '')::uuid;
begin
  insert into profiles (id, full_name, phone, venue_id)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone'),
    v_venue
  );
  if v_venue is not null then
    insert into venue_memberships (profile_id, venue_id, role)
    values (new.id, v_venue, 'player')
    on conflict (profile_id, venue_id) do nothing;
  end if;
  return new;
end;
$$;
