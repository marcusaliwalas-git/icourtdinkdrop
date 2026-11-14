-- Allow an "original" media size (show the image at its natural size, never cropped) in addition
-- to small/medium/large, for the hero and content sections.
alter table venues drop constraint venues_hero_media_size_check;
alter table venues add constraint venues_hero_media_size_check
  check (hero_media_size in ('small', 'medium', 'large', 'original'));

alter table venue_sections drop constraint venue_sections_media_size_check;
alter table venue_sections add constraint venue_sections_media_size_check
  check (media_size in ('small', 'medium', 'large', 'original'));
