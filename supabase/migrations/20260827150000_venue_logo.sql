-- Per-tenant logo: each venue can set its own logo, shown in the site header, admin header, and
-- login. Stored in a public bucket; only admins may upload/replace.
alter table venues
  add column logo_url text;

-- The existing (default) venue keeps the platform iCourt logo — the static asset in /public — so
-- nothing about its look changes; a stored relative path is resolved to an absolute URL in emails.
update venues set logo_url = '/icourt-social-logo.png' where slug = 'default' and logo_url is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('venue-logos', 'venue-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

create policy venue_logos_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'venue-logos' and is_admin())
  with check (bucket_id = 'venue-logos' and is_admin());
