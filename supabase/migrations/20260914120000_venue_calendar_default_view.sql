-- Which calendar view the admin day view opens on by default. A venue admin sets it (Admin →
-- Venue & Courts → Details); each staff member can still switch views, and their per-browser choice
-- overrides this default. Governed by the existing venues UPDATE policy (is_admin_of); not a
-- super-admin-guarded column, so a venue admin can change it directly.
alter table venues
  add column calendar_default_view text not null default 'grid'
  check (calendar_default_view in ('grid', 'timeline', 'find'));
