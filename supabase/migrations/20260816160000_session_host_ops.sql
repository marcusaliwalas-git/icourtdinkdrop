-- Phase 3 — host operations: the writes and reads the run screen needs, plus the RLS and
-- realtime wiring so an organizer (not an admin) can actually run their assigned session.
--
-- The rotation engine (start/end match, queue) landed in 20260816140737. This adds roster
-- management (add / check-in / remove signups) and the host-scoped SELECT policies that let
-- the host read their own session over RLS — every write still funnels through a
-- SECURITY DEFINER function gated on is_session_host().

-- ── Host read access ──────────────────────────────────────────────────────────
-- Admins already have full access via the *_admin_all policies. These grant the assigned
-- host read-only visibility into just their own session, so the run screen and the realtime
-- board (which delivers a change only when the subscriber can SELECT the row) work for them.

create policy sessions_host_select on sessions
  for select using (host_id = auth.uid());

create policy session_signups_host_select on session_signups
  for select using (
    exists (
      select 1 from sessions s
      where s.id = session_signups.session_id and s.host_id = auth.uid()
    )
  );

-- ── Roster management ─────────────────────────────────────────────────────────

-- Add a player to the session (a walk-in by name, or a member by profile). Checked in by
-- default, since the host is usually adding someone standing at the desk ready to play.
create or replace function session_add_signup(
  p_session_id uuid,
  p_guest_name text default null,
  p_profile_id uuid default null,
  p_check_in   boolean default true
)
returns session_signups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row session_signups;
begin
  if not is_session_host(p_session_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_profile_id is null and coalesce(btrim(p_guest_name), '') = '' then
    raise exception 'SIGNUP_NAME_REQUIRED' using errcode = 'P0001';
  end if;

  insert into session_signups (session_id, profile_id, guest_name, status, checked_in_at)
  values (
    p_session_id,
    p_profile_id,
    nullif(btrim(p_guest_name), ''),
    'confirmed',
    case when p_check_in then now() else null end
  )
  returning * into v_row;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_signup_added', 'session_signup', v_row.id, to_jsonb(v_row));

  return v_row;
end;
$$;

-- Toggle a player's checked-in state. Checking in preserves an existing check-in time so a
-- re-check-in never resets their place in the wait order; checking out clears it.
create or replace function session_set_check_in(
  p_signup_id  uuid,
  p_checked_in boolean
)
returns session_signups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
  v_row     session_signups;
begin
  select session_id into v_session from session_signups where id = p_signup_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not is_session_host(v_session) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  update session_signups
  set checked_in_at = case when p_checked_in then coalesce(checked_in_at, now()) else null end
  where id = p_signup_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Remove a signup entirely (a mistaken add, or someone who left). Blocked while they're on a
-- live court, since a match's players must stay resolvable.
create or replace function session_remove_signup(p_signup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
begin
  select session_id into v_session from session_signups where id = p_signup_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not is_session_host(v_session) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from session_match_players smp
    join session_matches m on m.id = smp.match_id
    where m.ended_at is null and smp.signup_id = p_signup_id
  ) then
    raise exception 'PLAYER_ALREADY_PLAYING' using errcode = 'P0001';
  end if;

  delete from session_signups where id = p_signup_id;
end;
$$;

grant execute on function session_add_signup(uuid, text, uuid, boolean) to authenticated;
grant execute on function session_set_check_in(uuid, boolean)           to authenticated;
grant execute on function session_remove_signup(uuid)                   to authenticated;

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Put the live tables on the realtime publication so the host board updates the instant a
-- match starts/ends or a player is checked in — realtime honours RLS, so a change is only
-- pushed to a client that can already SELECT the row (host via the policies above, admin via
-- *_admin_all). Guarded so re-running against an already-configured DB is a no-op.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_matches'
    ) then
      alter publication supabase_realtime add table session_matches;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_match_players'
    ) then
      alter publication supabase_realtime add table session_match_players;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_signups'
    ) then
      alter publication supabase_realtime add table session_signups;
    end if;
  end if;
end $$;
