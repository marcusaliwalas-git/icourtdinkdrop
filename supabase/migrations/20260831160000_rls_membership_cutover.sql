-- Multi-venue Step 7: the RLS cutover. Every tenant-scoped policy stops keying off the caller's
-- single venue (current_user_venue) and keys off membership in the ROW's venue instead. This is the
-- one behavioral change; the app already narrows reads to the current host's venue, so isolation is
-- preserved while an admin/member may now belong to several venues.

-- Caller is an admin of at least one venue (for un-venue-scoped admin writes like audit_log).
create or replace function is_admin_anywhere() returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (select 1 from venue_memberships where profile_id = auth.uid() and role = 'admin') $$;

-- Caller is an admin of some venue that p_profile belongs to (for profile-scoped tables with no
-- venue_id of their own: credits, notifications, waitlist, profiles, audit_log).
create or replace function admin_shares_venue_with(p_profile uuid) returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (
      select 1 from venue_memberships vm_p
      join venue_memberships vm_a on vm_a.venue_id = vm_p.venue_id
      where vm_p.profile_id = p_profile and vm_a.profile_id = auth.uid() and vm_a.role = 'admin'
    ) $$;

-- ── Venue-keyed tables: admin of the row's venue ──────────────────────────────
alter policy venues_admin_write on venues using (is_admin_of(id)) with check (is_admin_of(id));
alter policy courts_admin_write on courts using (is_admin_of(venue_id)) with check (is_admin_of(venue_id));
alter policy courts_select_public on courts using (is_active or is_admin_of(venue_id));
alter policy operating_hours_admin_write on operating_hours using (is_admin_of(venue_id)) with check (is_admin_of(venue_id));
alter policy closures_admin_write on closures using (is_admin_of(venue_id)) with check (is_admin_of(venue_id));
alter policy coaches_admin_all on coaches using (is_admin_of(venue_id)) with check (is_admin_of(venue_id));
alter policy coaches_public_select on coaches using (is_active or is_admin_of(venue_id));
alter policy sessions_admin_all on sessions using (is_admin_of(venue_id)) with check (is_admin_of(venue_id));
alter policy venue_sections_admin_all on venue_sections using (is_admin_of(venue_id)) with check (is_admin_of(venue_id));
alter policy venue_sections_public_select on venue_sections using (is_visible or is_admin_of(venue_id));
alter policy payment_accounts_admin_all on payment_accounts using (is_admin_of(venue_id)) with check (is_admin_of(venue_id));
alter policy memberships_admin_write on memberships using (is_admin_of(venue_id)) with check (is_admin_of(venue_id));
alter policy memberships_select on memberships using ((profile_id = auth.uid()) or is_admin_of(venue_id));

-- ── Tables whose venue comes via a helper on a related row ─────────────────────
alter policy court_rate_periods_admin_write on court_rate_periods
  using (is_admin_of(court_venue(court_id))) with check (is_admin_of(court_venue(court_id)));
alter policy bookings_admin_write on bookings
  using (is_admin_of(court_venue(court_id))) with check (is_admin_of(court_venue(court_id)));
alter policy bookings_select_own on bookings
  using ((booked_by = auth.uid()) or booking_has_player(id) or is_admin_of(court_venue(court_id)));
alter policy booking_slots_admin_write on booking_slots
  using (is_admin_of(court_venue(court_id))) with check (is_admin_of(court_venue(court_id)));
alter policy booking_players_admin_write on booking_players
  using (is_admin_of(booking_venue(booking_id))) with check (is_admin_of(booking_venue(booking_id)));
alter policy booking_players_select on booking_players
  using ((profile_id = auth.uid()) or is_booking_owner(booking_id) or is_admin_of(booking_venue(booking_id)));
alter policy coach_requests_admin_select on coach_requests using (is_admin_of(coach_venue(coach_id)));
alter policy coach_requests_admin_update on coach_requests
  using (is_admin_of(coach_venue(coach_id))) with check (is_admin_of(coach_venue(coach_id)));
alter policy session_signups_admin_all on session_signups
  using (is_admin_of(session_venue(session_id))) with check (is_admin_of(session_venue(session_id)));

-- ── Profile-scoped tables: admin who shares a venue with the profile ───────────
alter policy credits_admin_all on credits
  using (admin_shares_venue_with(profile_id)) with check (admin_shares_venue_with(profile_id));
alter policy credit_ledger_admin_all on credit_ledger
  using (admin_shares_venue_with(profile_id)) with check (admin_shares_venue_with(profile_id));
alter policy notifications_admin_all on notifications
  using (admin_shares_venue_with(profile_id)) with check (admin_shares_venue_with(profile_id));
alter policy waitlist_admin_all on waitlist
  using (admin_shares_venue_with(profile_id)) with check (admin_shares_venue_with(profile_id));
alter policy profiles_select on profiles using ((id = auth.uid()) or admin_shares_venue_with(id));
alter policy profiles_update on profiles
  using ((id = auth.uid()) or admin_shares_venue_with(id))
  with check ((id = auth.uid()) or admin_shares_venue_with(id));
alter policy profiles_delete on profiles using (admin_shares_venue_with(id));

-- ── Audit log ─────────────────────────────────────────────────────────────────
alter policy audit_log_admin_insert on audit_log with check (is_admin_anywhere());
alter policy audit_log_admin_select on audit_log using (admin_shares_venue_with(actor_id));
