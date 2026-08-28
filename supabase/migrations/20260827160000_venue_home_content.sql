-- Per-tenant home-page content: each venue customizes its landing page — hero copy + a hero
-- image/video, plus a stack of content sections (heading, text, and an image or video each).

-- ── Hero on the venue ─────────────────────────────────────────────────────────
alter table venues
  add column hero_heading text,
  add column hero_subheading text,
  add column hero_media_url text,
  add column hero_media_type text check (hero_media_type in ('image', 'video'));

-- ── Content sections (ordered blocks) ─────────────────────────────────────────
create table venue_sections (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  title text,
  body text,
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index venue_sections_venue_id_idx on venue_sections (venue_id);

create trigger venue_sections_set_updated_at
  before update on venue_sections
  for each row execute function set_updated_at();

alter table venue_sections enable row level security;

-- Anyone can read a venue's visible sections (its public home page); admins manage their own
-- venue's sections (incl. hidden ones).
create policy venue_sections_public_select on venue_sections
  for select using (is_visible or (is_admin() and venue_id = current_user_venue()));
create policy venue_sections_admin_all on venue_sections
  for all using (is_admin() and venue_id = current_user_venue())
  with check (is_admin() and venue_id = current_user_venue());

-- ── Media bucket (images + short videos) ──────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'venue-media', 'venue-media', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
);

create policy venue_media_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'venue-media' and is_admin())
  with check (bucket_id = 'venue-media' and is_admin());
