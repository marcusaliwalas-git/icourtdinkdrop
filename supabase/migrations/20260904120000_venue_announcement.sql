-- Per-venue announcement banner shown at the top of the public site (events, promos, notices).
-- The admin picks one of two modes — a short text message or an uploaded image — plus an optional
-- click-through link. Off by default; the existing is_admin_of() venue UPDATE policy governs writes.
alter table venues
  add column announcement_enabled   boolean not null default false,
  add column announcement_type      text not null default 'text' check (announcement_type in ('text', 'image')),
  add column announcement_text      text,
  add column announcement_image_url text,
  add column announcement_link      text;
