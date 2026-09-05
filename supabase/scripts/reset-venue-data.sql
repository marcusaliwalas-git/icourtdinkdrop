-- ─────────────────────────────────────────────────────────────────────────────
-- Reset ONE venue's test data before handover — safe on the shared multi-tenant DB.
--
-- HOW TO USE (Supabase → SQL editor):
--   1. BACK UP FIRST (Dashboard → Database → Backups → Create backup).
--   2. Put the venue's id in the ONE place marked below.
--   3. Run the whole script. It runs in a transaction and prints how many rows each
--      step will remove, plus a final check that config is intact.
--   4. If the numbers look right, run  COMMIT;  — otherwise run  ROLLBACK;.
--
-- KEEPS (the venue's setup): the venue row + its branding/theme/homepage/footer,
--   courts, operating hours, rate periods, coaches, payment accounts, and the
--   venue's ADMIN membership.
-- REMOVES (test/transactional): bookings + slots + players, closures, sessions +
--   signups, waitlist, coach requests, paid memberships, audit log, and every
--   NON-admin membership (so the Members list starts empty).
-- Nothing here touches any OTHER venue — every delete is scoped to this venue.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

-- ▼▼▼ THE ONLY LINE YOU EDIT ▼▼▼
create temp table _v(id uuid);
insert into _v values ('00000000-0000-0000-0000-000000000000');  -- ← paste the venue id
-- ▲▲▲

-- Sanity check — make sure this is the venue you mean before going further:
select name, slug, custom_domain from venues where id = (select id from _v);

-- Helper set: this venue's courts / coaches / sessions.
create temp table _courts   as select id from courts   where venue_id = (select id from _v);
create temp table _coaches  as select id from coaches  where venue_id = (select id from _v);
create temp table _sessions as select id from sessions where venue_id = (select id from _v);
create temp table _bookings as select id from bookings where court_id in (select id from _courts);

-- 1. Bookings and their children.
with d as (delete from booking_players where booking_id in (select id from _bookings) returning 1) select count(*) as booking_players_deleted from d;
with d as (delete from booking_slots   where booking_id in (select id from _bookings) returning 1) select count(*) as booking_slots_deleted   from d;
with d as (delete from bookings         where id         in (select id from _bookings) returning 1) select count(*) as bookings_deleted        from d;

-- 2. Closures.
with d as (delete from closures where venue_id = (select id from _v) returning 1) select count(*) as closures_deleted from d;

-- 3. Sessions / signups / waitlist.
with d as (delete from session_signups where session_id in (select id from _sessions) returning 1) select count(*) as session_signups_deleted from d;
with d as (delete from waitlist where session_id in (select id from _sessions)
                                   or court_id   in (select id from _courts) returning 1) select count(*) as waitlist_deleted from d;
with d as (delete from sessions where venue_id = (select id from _v) returning 1) select count(*) as sessions_deleted from d;

-- 4. Coach requests (keep the coaches themselves).
with d as (delete from coach_requests where coach_id in (select id from _coaches) returning 1) select count(*) as coach_requests_deleted from d;

-- 5. Paid memberships for this venue.
with d as (delete from memberships where venue_id = (select id from _v) returning 1) select count(*) as memberships_deleted from d;

-- 6. Audit trail for this venue.
with d as (delete from audit_log where venue_id = (select id from _v) returning 1) select count(*) as audit_rows_deleted from d;

-- 7. Non-admin memberships → the Members list starts empty. Keeps the admin(s).
with d as (delete from venue_memberships where venue_id = (select id from _v) and role <> 'admin' returning 1)
select count(*) as member_links_removed from d;

-- Final check — config that should REMAIN:
select
  (select count(*) from courts          where venue_id = (select id from _v)) as courts_kept,
  (select count(*) from operating_hours where venue_id = (select id from _v)) as hours_kept,
  (select count(*) from payment_accounts where venue_id = (select id from _v)) as payment_accounts_kept,
  (select count(*) from venue_memberships where venue_id = (select id from _v) and role = 'admin') as admins_kept,
  (select count(*) from bookings where court_id in (select id from _courts)) as bookings_left;   -- should be 0

-- Review the counts above.  Then run ONE of:
--   COMMIT;    -- keep the reset
--   ROLLBACK;  -- undo everything (nothing was actually deleted yet)

-- ── OPTIONAL add-ons (uncomment BEFORE commit if you want them) ──────────────
-- Reset the homepage / footer / announcement back to blank defaults:
--   update venues set hero_heading=null, hero_subheading=null, hero_media_url=null, hero_media_type=null,
--     how_steps=null, how_note=null, how_note_hidden=false,
--     footer_about=null, footer_email=null, footer_phone=null, footer_address=null,
--     footer_socials='[]'::jsonb, footer_links='[]'::jsonb,
--     announcement_enabled=false, announcement_text=null, announcement_image_url=null, announcement_link=null
--   where id = (select id from _v);
--   delete from venue_sections where venue_id = (select id from _v);
--
-- Remove test coaches too (only if they were test entries):
--   delete from coaches where venue_id = (select id from _v);
--
-- NOTE on test CUSTOMER ACCOUNTS: their login (auth.users) and profile are NOT
-- deleted here — an email can belong to several venues, and deleting accounts is
-- destructive. After step 7 they no longer appear under this venue anyway. If you
-- truly want to delete a test account, do it from Supabase → Authentication →
-- Users (that cascades its profile), one at a time, only for accounts you created.
