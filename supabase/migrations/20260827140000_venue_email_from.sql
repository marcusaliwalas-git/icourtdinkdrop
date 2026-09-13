-- Optional per-tenant sending address for transactional emails. The display name reuses the
-- venue's `name`; this is the address it's sent from. Null = use the shared platform address
-- (RESEND_FROM_EMAIL). A custom address requires that domain to be verified in Resend.
alter table venues
  add column email_from text;
