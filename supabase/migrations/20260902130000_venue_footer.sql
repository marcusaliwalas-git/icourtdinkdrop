-- Per-venue customizable site footer. Scalars for the about blurb + contact fields; two jsonb
-- arrays for the repeatable lists (socials and custom links). Editable by a venue admin through
-- Admin → Footer; rendered site-wide (except /admin). All optional — an empty footer renders only
-- the auto copyright line.
alter table venues
  add column footer_about   text,
  add column footer_email   text,
  add column footer_phone   text,
  add column footer_address text,
  -- [{ "platform": "instagram", "url": "https://..." }, ...]
  add column footer_socials jsonb not null default '[]'::jsonb,
  -- [{ "label": "Terms", "url": "https://..." }, ...]
  add column footer_links   jsonb not null default '[]'::jsonb;

-- Existing UPDATE policy on venues (is_admin_of(id), from the membership cutover) already governs
-- who can write these columns — no new policy needed.
