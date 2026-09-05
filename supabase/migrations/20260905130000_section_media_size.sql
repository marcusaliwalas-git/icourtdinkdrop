-- Let admins choose the display size of each home-page content section's image/video too.
alter table venue_sections
  add column media_size text not null default 'medium'
  check (media_size in ('small', 'medium', 'large'));
