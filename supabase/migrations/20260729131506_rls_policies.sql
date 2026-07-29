-- RLS on every table (spec 5: "RLS on every table. A player can only read their own
-- bookings and payment records."). Writes to bookings/booking_players/audit_log happen
-- exclusively through SECURITY DEFINER functions (see booking_functions migration), which
-- run as the table owner and bypass these policies by design — so those tables intentionally
-- get no client-facing insert/update policy beyond the admin escape hatch.

alter table profiles enable row level security;
alter table memberships enable row level security;
alter table venues enable row level security;
alter table courts enable row level security;
alter table operating_hours enable row level security;
alter table closures enable row level security;
alter table bookings enable row level security;
alter table booking_players enable row level security;
alter table booking_slots enable row level security;
alter table audit_log enable row level security;
alter table sessions enable row level security;
alter table session_signups enable row level security;
alter table waitlist enable row level security;
alter table credits enable row level security;
alter table credit_ledger enable row level security;
alter table notifications enable row level security;

-- profiles
create policy profiles_select on profiles
  for select using (id = auth.uid() or is_admin());

create policy profiles_update on profiles
  for update using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

create policy profiles_delete on profiles
  for delete using (is_admin());

-- memberships
create policy memberships_select on memberships
  for select using (profile_id = auth.uid() or is_admin());

create policy memberships_admin_write on memberships
  for all using (is_admin()) with check (is_admin());

-- venues (public read for discovery; only admins manage venues)
create policy venues_select_public on venues
  for select using (true);

create policy venues_admin_write on venues
  for all using (is_admin()) with check (is_admin());

-- courts (public read of active courts only; admins see and manage everything)
create policy courts_select_public on courts
  for select using (is_active or is_admin());

create policy courts_admin_write on courts
  for all using (is_admin()) with check (is_admin());

-- operating_hours (public read; admin write)
create policy operating_hours_select_public on operating_hours
  for select using (true);

create policy operating_hours_admin_write on operating_hours
  for all using (is_admin()) with check (is_admin());

-- closures (public read so the availability grid can grey out blocked slots; admin write)
create policy closures_select_public on closures
  for select using (true);

create policy closures_admin_write on closures
  for all using (is_admin()) with check (is_admin());

-- bookings <-> booking_players: each table's SELECT policy needs to check a condition on
-- the OTHER table (is this booking owned by me? / does this booking have me as a named
-- player?). Doing that with a direct EXISTS subquery on the other table causes Postgres to
-- recurse — evaluating bookings' policy triggers booking_players' policy, which triggers
-- bookings' policy again, and so on ("infinite recursion detected in policy"). Routing the
-- cross-table check through a SECURITY DEFINER function breaks the cycle: the function runs
-- as its owner (postgres, a superuser), which bypasses RLS on the table it queries entirely,
-- so it never re-enters the calling table's policy.
create or replace function booking_has_player(p_booking_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from booking_players where booking_id = p_booking_id and profile_id = auth.uid()
  );
$$;

create or replace function is_booking_owner(p_booking_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from bookings where id = p_booking_id and booked_by = auth.uid()
  );
$$;

-- bookings: a player can read bookings they made or are a named player on; admins read/write all.
-- Creation and cancellation happen through SECURITY DEFINER functions, not direct client writes.
create policy bookings_select_own on bookings
  for select using (
    booked_by = auth.uid()
    or booking_has_player(id)
    or is_admin()
  );

create policy bookings_admin_write on bookings
  for all using (is_admin()) with check (is_admin());

-- booking_players: visible to the named player, the booking owner, or admins.
create policy booking_players_select on booking_players
  for select using (
    profile_id = auth.uid()
    or is_booking_owner(booking_id)
    or is_admin()
  );

create policy booking_players_admin_write on booking_players
  for all using (is_admin()) with check (is_admin());

-- booking_slots: public read (court_id + time_range only, no PII) so the availability
-- grid and its realtime subscription work for anonymous visitors too.
create policy booking_slots_select_public on booking_slots
  for select using (true);

create policy booking_slots_admin_write on booking_slots
  for all using (is_admin()) with check (is_admin());

-- audit_log: admin-only, read-only from the client.
create policy audit_log_admin_select on audit_log
  for select using (is_admin());

-- Dormant Phase 2-4 tables: admin escape hatch only for now. Player-facing policies
-- (own signups, own credit balance, own notifications, etc.) are added when each phase
-- builds the feature that needs them.
create policy sessions_admin_all on sessions
  for all using (is_admin()) with check (is_admin());

create policy session_signups_admin_all on session_signups
  for all using (is_admin()) with check (is_admin());

create policy waitlist_admin_all on waitlist
  for all using (is_admin()) with check (is_admin());

create policy credits_admin_all on credits
  for all using (is_admin()) with check (is_admin());

create policy credit_ledger_admin_all on credit_ledger
  for all using (is_admin()) with check (is_admin());

create policy notifications_admin_all on notifications
  for all using (is_admin()) with check (is_admin());
