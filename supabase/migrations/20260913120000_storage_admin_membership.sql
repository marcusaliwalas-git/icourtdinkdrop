-- The membership RLS cutover (20260831160000) moved every table policy from the legacy is_admin()
-- (profiles.role = 'admin') to the membership model, but missed the three storage.objects write
-- policies. A membership-based admin — one added via venue_memberships (e.g. through the "Add admin"
-- flow) whose profiles.role is not 'admin' — therefore fails is_admin() and hits "new row violates
-- row-level security policy" when uploading an announcement banner / homepage media (venue-media),
-- a venue logo (venue-logos), or a coach photo (coach-photos).
--
-- Move all three to is_admin_anywhere() (admin of at least one venue), the same membership helper
-- the audit_log insert policy uses. These are shared public buckets keyed by random-uuid paths with
-- no venue_id to scope by, so "is an admin somewhere" is the correct gate.
alter policy venue_media_admin_write on storage.objects
  using (bucket_id = 'venue-media' and is_admin_anywhere())
  with check (bucket_id = 'venue-media' and is_admin_anywhere());

alter policy venue_logos_admin_write on storage.objects
  using (bucket_id = 'venue-logos' and is_admin_anywhere())
  with check (bucket_id = 'venue-logos' and is_admin_anywhere());

alter policy coach_photos_admin_write on storage.objects
  using (bucket_id = 'coach-photos' and is_admin_anywhere())
  with check (bucket_id = 'coach-photos' and is_admin_anywhere());
