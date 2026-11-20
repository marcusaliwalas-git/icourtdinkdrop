-- Fix: a freshly-tagged member's perks (member rate + booking window) didn't apply during the
-- venue's early-morning hours. has_active_membership compared starts_on/ends_on against the DB's
-- current_date (UTC), but the admin sets those dates in the venue's local timezone. For a venue
-- ahead of UTC (e.g. Asia/Manila, UTC+8), a membership starting "today" locally has
-- starts_on > current_date(UTC) until UTC rolls over — so it read as not-yet-active.
--
-- Compare against the venue's local date instead, matching how the dates were entered. Same
-- signature, so this replaces the function in place.
create or replace function has_active_membership(p_profile_id uuid, p_venue_id uuid) returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (
      select 1
      from memberships m
      join venues v on v.id = m.venue_id
      where m.profile_id = p_profile_id
        and m.venue_id = p_venue_id
        and m.status = 'active'
        and m.starts_on <= (now() at time zone v.timezone)::date
        and (m.ends_on is null or m.ends_on >= (now() at time zone v.timezone)::date)
    ) $$;
