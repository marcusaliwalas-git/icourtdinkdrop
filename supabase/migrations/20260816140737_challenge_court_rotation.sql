-- Phase 3 — Challenge-court / rotation mode + organizer host access.
--
-- Builds on the existing (dormant) `sessions` / `session_signups` tables, which already
-- carry host_id, courts_used[], format='challenge_court', capacity, checked_in_at, status.
-- This migration adds the rotation engine (matches, queue, history) and its access control.
--
-- Access model — two layers, both enforced server-side, same shape as the booking functions:
--   1. ROLE gates the capability: an admin promotes a player to `organizer` (profiles.role);
--      the existing guard_profile_role_change() trigger already blocks non-admin role changes.
--   2. SESSION ASSIGNMENT scopes the instance: sessions.host_id says WHICH session that
--      organizer may run. Every write goes through a SECURITY DEFINER function that checks
--      "admin OR this session's host", so an organizer can only touch their own event's
--      courts, during its live window — never the venue calendar.

-- ── Schema ──────────────────────────────────────────────────────────────────

-- When each checked-in player last came off a court, so the queue rotates fairly.
alter table session_signups
  add column last_played_at timestamptz;

-- One match = one court in play for a slice of the session (singles 1v1 or doubles 2v2);
-- ended_at null means it's live.
create table session_matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  court_id uuid not null references courts (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  winning_team smallint check (winning_team in (1, 2)),
  created_at timestamptz not null default now()
);
create index session_matches_session_idx on session_matches (session_id);

-- The database itself guarantees a court can't host two live matches at once — the queue can
-- never double-book a court, same spirit as the booking exclusion constraint.
create unique index session_matches_one_live_per_court
  on session_matches (court_id) where (ended_at is null);

-- Who played, on which side. Players are session signups (member or guest).
create table session_match_players (
  match_id  uuid not null references session_matches (id) on delete cascade,
  signup_id uuid not null references session_signups (id) on delete cascade,
  team      smallint not null check (team in (1, 2)),
  primary key (match_id, signup_id)
);

-- ── Access helper ─────────────────────────────────────────────────────────────

-- Admin, OR the organizer assigned to host this specific session. The whole access story.
create or replace function is_session_host(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_admin() or exists (
    select 1 from sessions s
    where s.id = p_session_id
      and s.host_id = auth.uid()
  );
$$;

-- ── Rotation engine ───────────────────────────────────────────────────────────

-- Seat the next players onto an open court. Caller passes the two teams in order.
create or replace function session_start_match(
  p_session_id uuid,
  p_court_id   uuid,
  p_team1      uuid[],
  p_team2      uuid[]
)
returns session_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session sessions;
  v_match   session_matches;
  v_all     uuid[] := coalesce(p_team1, '{}'::uuid[]) || coalesce(p_team2, '{}'::uuid[]);
begin
  if not is_session_host(p_session_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_session from sessions where id = p_session_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Session must be live: published and inside its time window.
  if v_session.status <> 'published'
     or now() < v_session.starts_at or now() > v_session.ends_at then
    raise exception 'SESSION_NOT_LIVE' using errcode = 'P0001';
  end if;

  if not (p_court_id = any (v_session.courts_used)) then
    raise exception 'COURT_NOT_IN_SESSION' using errcode = 'P0001';
  end if;

  -- Even teams, singles (1) or doubles (2) a side.
  if array_length(p_team1, 1) is distinct from array_length(p_team2, 1)
     or coalesce(array_length(p_team1, 1), 0) not in (1, 2) then
    raise exception 'INVALID_MATCH_SIZE' using errcode = 'P0001';
  end if;

  -- Friendly court-occupancy check; the unique index is the ultimate race backstop.
  if exists (select 1 from session_matches where court_id = p_court_id and ended_at is null) then
    raise exception 'COURT_IN_USE' using errcode = 'P0001';
  end if;

  -- Every player is a checked-in, confirmed signup of THIS session.
  if exists (
    select 1 from unnest(v_all) sid
    where not exists (
      select 1 from session_signups ss
      where ss.id = sid
        and ss.session_id = p_session_id
        and ss.status = 'confirmed'
        and ss.checked_in_at is not null
    )
  ) then
    raise exception 'PLAYER_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  -- Nobody is already on another court.
  if exists (
    select 1 from session_match_players smp
    join session_matches m on m.id = smp.match_id
    where m.ended_at is null and smp.signup_id = any (v_all)
  ) then
    raise exception 'PLAYER_ALREADY_PLAYING' using errcode = 'P0001';
  end if;

  insert into session_matches (session_id, court_id)
  values (p_session_id, p_court_id)
  returning * into v_match;

  insert into session_match_players (match_id, signup_id, team)
    select v_match.id, sid, 1 from unnest(p_team1) sid
    union all
    select v_match.id, sid, 2 from unnest(p_team2) sid;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_match_started', 'session_match', v_match.id, to_jsonb(v_match));

  return v_match;
end;
$$;

-- Call the winner and free the court; everyone who just played rotates to the back of the queue.
create or replace function session_end_match(
  p_match_id     uuid,
  p_winning_team smallint
)
returns session_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match session_matches;
begin
  select * into v_match from session_matches where id = p_match_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not is_session_host(v_match.session_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if v_match.ended_at is not null then
    raise exception 'MATCH_ALREADY_ENDED' using errcode = 'P0001';
  end if;
  if p_winning_team not in (1, 2) then
    raise exception 'INVALID_TEAM' using errcode = 'P0001';
  end if;

  update session_matches
  set ended_at = now(), winning_team = p_winning_team
  where id = p_match_id
  returning * into v_match;

  update session_signups
  set last_played_at = now()
  where id in (select signup_id from session_match_players where match_id = p_match_id);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_match_ended', 'session_match', v_match.id, to_jsonb(v_match));

  return v_match;
end;
$$;

-- ── Reads: the live queue ─────────────────────────────────────────────────────

-- "Next up": checked-in players not currently on a court, longest wait first. Never-played
-- players fall back to their check-in time, so they queue ahead of anyone who has played.
create or replace function session_queue(p_session_id uuid)
returns table (signup_id uuid, name text, waited_since timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select ss.id,
         coalesce(p.full_name, ss.guest_name)        as name,
         coalesce(ss.last_played_at, ss.checked_in_at) as waited_since
  from session_signups ss
  left join profiles p on p.id = ss.profile_id
  where ss.session_id = p_session_id
    and ss.status = 'confirmed'
    and ss.checked_in_at is not null
    and not exists (
      select 1 from session_match_players smp
      join session_matches m on m.id = smp.match_id
      where m.ended_at is null and smp.signup_id = ss.id
    )
  order by waited_since asc;
$$;

-- ── Grants & RLS ──────────────────────────────────────────────────────────────

grant execute on function is_session_host(uuid)                           to authenticated;
grant execute on function session_start_match(uuid, uuid, uuid[], uuid[]) to authenticated;
grant execute on function session_end_match(uuid, smallint)               to authenticated;
grant execute on function session_queue(uuid)                             to authenticated;

alter table session_matches       enable row level security;
alter table session_match_players enable row level security;

-- Reads: the host/admin, and anyone signed up to the session, can watch the board. Writes only
-- ever happen inside the SECURITY DEFINER functions above (which bypass RLS as owner), so there
-- are deliberately no write policies.
create policy session_matches_select on session_matches
  for select using (
    is_session_host(session_id)
    or exists (
      select 1 from session_signups ss
      where ss.session_id = session_matches.session_id and ss.profile_id = auth.uid()
    )
  );

create policy session_match_players_select on session_match_players
  for select using (
    exists (
      select 1 from session_matches m
      where m.id = session_match_players.match_id
        and (
          is_session_host(m.session_id)
          or exists (
            select 1 from session_signups ss
            where ss.session_id = m.session_id and ss.profile_id = auth.uid()
          )
        )
    )
  );
