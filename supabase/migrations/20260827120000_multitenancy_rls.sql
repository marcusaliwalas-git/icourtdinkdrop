-- Multi-tenancy isolation (Phase 3): every private row and every admin write is scoped to the
-- caller's venue via current_user_venue(). Public catalog reads (venues, active courts, hours,
-- closures, rate periods, active coaches, booking_slots) stay open — they're public info and the
-- app only ever queries the host's venue — so an anonymous visitor can still browse and book.
--
-- Admin is now per-tenant: role='admin' AND the row belongs to the admin's own venue.

-- ── Row → venue helpers (SECURITY DEFINER so policies don't recurse through RLS) ──
create or replace function court_venue(p_court uuid) returns uuid
  language sql security definer stable set search_path = public as $$
    select venue_id from courts where id = p_court $$;
create or replace function profile_venue(p_profile uuid) returns uuid
  language sql security definer stable set search_path = public as $$
    select venue_id from profiles where id = p_profile $$;
create or replace function coach_venue(p_coach uuid) returns uuid
  language sql security definer stable set search_path = public as $$
    select venue_id from coaches where id = p_coach $$;
create or replace function session_venue(p_session uuid) returns uuid
  language sql security definer stable set search_path = public as $$
    select venue_id from sessions where id = p_session $$;
create or replace function booking_venue(p_booking uuid) returns uuid
  language sql security definer stable set search_path = public as $$
    select court_venue(court_id) from bookings where id = p_booking $$;

-- ── Freeze a member's own role AND venue on self-update ────────────────────────
-- A user editing their own profile must not be able to change which tenant they belong to (that
-- would grant access to another org's data). Admins may still be moved by service-role code.
create or replace function guard_profile_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not is_admin() then
    new.role := old.role;
    new.venue_id := old.venue_id;
  end if;
  return new;
end;
$$;

-- ── profiles ──────────────────────────────────────────────────────────────────
drop policy profiles_select on profiles;
create policy profiles_select on profiles
  for select using (id = auth.uid() or (is_admin() and venue_id = current_user_venue()));
drop policy profiles_update on profiles;
create policy profiles_update on profiles
  for update using (id = auth.uid() or (is_admin() and venue_id = current_user_venue()))
  with check (id = auth.uid() or (is_admin() and venue_id = current_user_venue()));
drop policy profiles_delete on profiles;
create policy profiles_delete on profiles
  for delete using (is_admin() and venue_id = current_user_venue());

-- ── memberships ───────────────────────────────────────────────────────────────
drop policy memberships_select on memberships;
create policy memberships_select on memberships
  for select using (profile_id = auth.uid() or (is_admin() and profile_venue(profile_id) = current_user_venue()));
drop policy memberships_admin_write on memberships;
create policy memberships_admin_write on memberships
  for all using (is_admin() and profile_venue(profile_id) = current_user_venue())
  with check (is_admin() and profile_venue(profile_id) = current_user_venue());

-- ── venues (public read stays) — an admin may only edit their own venue ─────────
drop policy venues_admin_write on venues;
create policy venues_admin_write on venues
  for all using (is_admin() and id = current_user_venue())
  with check (is_admin() and id = current_user_venue());

-- ── courts / operating_hours / closures / rate periods (public read stays) ──────
drop policy courts_admin_write on courts;
create policy courts_admin_write on courts
  for all using (is_admin() and venue_id = current_user_venue())
  with check (is_admin() and venue_id = current_user_venue());

drop policy operating_hours_admin_write on operating_hours;
create policy operating_hours_admin_write on operating_hours
  for all using (is_admin() and venue_id = current_user_venue())
  with check (is_admin() and venue_id = current_user_venue());

drop policy closures_admin_write on closures;
create policy closures_admin_write on closures
  for all using (is_admin() and venue_id = current_user_venue())
  with check (is_admin() and venue_id = current_user_venue());

drop policy court_rate_periods_admin_write on court_rate_periods;
create policy court_rate_periods_admin_write on court_rate_periods
  for all using (is_admin() and court_venue(court_id) = current_user_venue())
  with check (is_admin() and court_venue(court_id) = current_user_venue());

-- ── bookings / booking_players / booking_slots ─────────────────────────────────
drop policy bookings_select_own on bookings;
create policy bookings_select_own on bookings
  for select using (
    booked_by = auth.uid()
    or booking_has_player(id)
    or (is_admin() and court_venue(court_id) = current_user_venue())
  );
drop policy bookings_admin_write on bookings;
create policy bookings_admin_write on bookings
  for all using (is_admin() and court_venue(court_id) = current_user_venue())
  with check (is_admin() and court_venue(court_id) = current_user_venue());

drop policy booking_players_select on booking_players;
create policy booking_players_select on booking_players
  for select using (
    profile_id = auth.uid()
    or is_booking_owner(booking_id)
    or (is_admin() and booking_venue(booking_id) = current_user_venue())
  );
drop policy booking_players_admin_write on booking_players;
create policy booking_players_admin_write on booking_players
  for all using (is_admin() and booking_venue(booking_id) = current_user_venue())
  with check (is_admin() and booking_venue(booking_id) = current_user_venue());

drop policy booking_slots_admin_write on booking_slots;
create policy booking_slots_admin_write on booking_slots
  for all using (is_admin() and court_venue(court_id) = current_user_venue())
  with check (is_admin() and court_venue(court_id) = current_user_venue());

-- ── audit_log (admins see their own venue's entries) ───────────────────────────
drop policy audit_log_admin_select on audit_log;
create policy audit_log_admin_select on audit_log
  for select using (is_admin() and profile_venue(actor_id) = current_user_venue());

-- ── coaches (public read stays) / coach_requests (public insert stays) ─────────
drop policy coaches_admin_all on coaches;
create policy coaches_admin_all on coaches
  for all using (is_admin() and venue_id = current_user_venue())
  with check (is_admin() and venue_id = current_user_venue());

drop policy coach_requests_admin_select on coach_requests;
create policy coach_requests_admin_select on coach_requests
  for select using (is_admin() and coach_venue(coach_id) = current_user_venue());
drop policy coach_requests_admin_update on coach_requests;
create policy coach_requests_admin_update on coach_requests
  for update using (is_admin() and coach_venue(coach_id) = current_user_venue())
  with check (is_admin() and coach_venue(coach_id) = current_user_venue());

-- ── sessions / session_signups ─────────────────────────────────────────────────
drop policy sessions_admin_all on sessions;
create policy sessions_admin_all on sessions
  for all using (is_admin() and venue_id = current_user_venue())
  with check (is_admin() and venue_id = current_user_venue());
drop policy session_signups_admin_all on session_signups;
create policy session_signups_admin_all on session_signups
  for all using (is_admin() and session_venue(session_id) = current_user_venue())
  with check (is_admin() and session_venue(session_id) = current_user_venue());

-- ── Dormant Phase 2-4 tables — scope by the profile's venue too ────────────────
drop policy waitlist_admin_all on waitlist;
create policy waitlist_admin_all on waitlist
  for all using (is_admin() and profile_venue(profile_id) = current_user_venue())
  with check (is_admin() and profile_venue(profile_id) = current_user_venue());
drop policy credits_admin_all on credits;
create policy credits_admin_all on credits
  for all using (is_admin() and profile_venue(profile_id) = current_user_venue())
  with check (is_admin() and profile_venue(profile_id) = current_user_venue());
drop policy credit_ledger_admin_all on credit_ledger;
create policy credit_ledger_admin_all on credit_ledger
  for all using (is_admin() and profile_venue(profile_id) = current_user_venue())
  with check (is_admin() and profile_venue(profile_id) = current_user_venue());
drop policy notifications_admin_all on notifications;
create policy notifications_admin_all on notifications
  for all using (is_admin() and profile_venue(profile_id) = current_user_venue())
  with check (is_admin() and profile_venue(profile_id) = current_user_venue());
