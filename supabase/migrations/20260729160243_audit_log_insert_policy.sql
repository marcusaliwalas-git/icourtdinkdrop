-- audit_log previously had only a SELECT policy for admins. Every admin action logged via
-- the client's own session (venue/court/closure edits, no-show resets, booking restrictions
-- in src/app/admin/*/actions.ts) was silently failing to write its entry, since RLS blocked
-- the INSERT with no matching policy — invisible because those inserts weren't error-checked.
-- Only booking events (logged inside the SECURITY DEFINER SQL functions, which run as the
-- table owner and bypass RLS) were actually being recorded. Audit log stays append-only:
-- admins can insert, nobody can update or delete past entries.
create policy audit_log_admin_insert on audit_log
  for insert with check (is_admin());
