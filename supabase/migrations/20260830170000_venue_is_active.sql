-- Let a super admin take a tenant offline without deleting it. An inactive venue keeps all its
-- data (courts, bookings, hours…) but no longer resolves from its hostname, so its public site
-- and booking flow stop serving. Reversible — flip it back to true to bring the venue back.
alter table venues add column is_active boolean not null default true;
