-- Newer Supabase Postgres images don't auto-expose new tables to the Data API roles
-- (anon/authenticated/service_role default to TRUNCATE/REFERENCES/TRIGGER/MAINTAIN only —
-- no SELECT/INSERT/UPDATE/DELETE). RLS is still the real enforcement; these grants are the
-- coarse table-level gate that must pass before RLS is ever evaluated.
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

-- Apply the same grants automatically to tables created by later migrations, so this
-- doesn't need to be remembered again in Phase 2+.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
