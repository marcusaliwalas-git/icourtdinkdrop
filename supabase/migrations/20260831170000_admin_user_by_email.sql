-- Multi-venue Step 8 support: let super-admin onboarding link an EXISTING account to a new venue as
-- its admin (so one person can administer several venues). Looks up an auth user id by email.
-- Restricted to service_role — the onboarding action calls it with the service-role key; regular
-- users cannot (that would leak the email→id mapping).
create or replace function admin_user_id_by_email(p_email text) returns uuid
  language sql security definer stable set search_path = '' as $$
    select id from auth.users where lower(email) = lower(p_email) limit 1 $$;

revoke all on function admin_user_id_by_email(text) from public;
grant execute on function admin_user_id_by_email(text) to service_role;
