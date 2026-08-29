-- Let a venue hide the "How it works" note entirely. Without this, a null note falls back to the
-- built-in default, so there was no way to show the steps with no note beneath them.
alter table venues add column how_note_hidden boolean not null default false;
