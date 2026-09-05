-- Let admins choose how tall the homepage hero image/video displays.
alter table venues
  add column hero_media_size text not null default 'medium'
  check (hero_media_size in ('small', 'medium', 'large'));
