-- Platform super admin: a person who operates the whole deployment (onboards new tenants),
-- distinct from a venue admin (role='admin', scoped to one venue). Super-admin actions run through
-- the service-role client after checking this flag, so no cross-tenant RLS is opened up here.
--
-- Bootstrapping: there is no UI to mint the first super admin — set it directly, e.g.
--   update profiles set is_super_admin = true where id = (select id from auth.users where email = 'you@example.com');
alter table profiles add column is_super_admin boolean not null default false;
