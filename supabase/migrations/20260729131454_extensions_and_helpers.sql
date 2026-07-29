-- Extensions
create extension if not exists pgcrypto;
-- btree_gist lets the bookings exclusion constraint mix an equality column (court_id)
-- with a range overlap column (time_range) in a single GiST index.
create extension if not exists btree_gist;

-- Generic updated_at maintenance, reused by every table with an updated_at column.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
