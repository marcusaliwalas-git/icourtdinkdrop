-- Per-tenant "How it works" strip on the home page: each venue sets its own ordered steps and a
-- supporting note (e.g. some pay at the venue, some pay via transfer). Null falls back to the
-- app's built-in copy so an unconfigured venue still reads sensibly.
alter table venues
  add column how_steps text[],
  add column how_note text;
