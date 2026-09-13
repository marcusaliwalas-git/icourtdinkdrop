-- Mirror the account email onto profiles so admin surfaces can fall back to it when a member has no
-- full_name (auth.users isn't readable from the app under RLS). Backfilled, set on signup, and kept
-- in sync when the account email changes.
alter table profiles add column email text;

update profiles p set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- New signups: also copy the email.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue uuid := nullif(new.raw_user_meta_data ->> 'venue_id', '')::uuid;
begin
  insert into profiles (id, full_name, phone, email, venue_id)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone'),
    new.email,
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

-- Keep it current if the account email changes.
create or replace function sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function sync_profile_email();
