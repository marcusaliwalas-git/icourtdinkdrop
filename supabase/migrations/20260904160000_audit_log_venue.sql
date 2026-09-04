-- Give audit_log a venue_id so the admin Audit page can scope to one venue (a multi-venue admin
-- otherwise sees entries across all their venues). Derived from the logged entity by a trigger, so
-- the SECURITY DEFINER booking RPCs and every other insert site need no changes.
alter table audit_log add column venue_id uuid references venues (id) on delete cascade;

-- Map an audit row's (entity, entity_id) to its venue. profile is venue-ambiguous under multi-venue
-- membership, so callers that know the acting venue set venue_id themselves; this fills it from the
-- profile's legacy home venue only as a fallback.
create or replace function audit_log_fill_venue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.venue_id is null and new.entity_id is not null then
    new.venue_id := case new.entity
      when 'venue'   then (select id from venues where id = new.entity_id)
      when 'court'   then (select venue_id from courts   where id = new.entity_id)
      when 'coach'   then (select venue_id from coaches  where id = new.entity_id)
      when 'closure' then (select venue_id from closures where id = new.entity_id)
      when 'booking' then (select c.venue_id from bookings b join courts c on c.id = b.court_id where b.id = new.entity_id)
      when 'profile' then (select venue_id from profiles where id = new.entity_id)
      else null
    end;
  end if;
  return new;
end; $$;

create trigger audit_log_set_venue before insert on audit_log
  for each row execute function audit_log_fill_venue();

-- Backfill existing rows with the same derivation.
-- `when 'venue' then (select id from venues …)` (not a.entity_id directly) so an audit row for a
-- since-deleted venue backfills to null instead of a dangling id that violates the FK.
update audit_log a set venue_id = case a.entity
  when 'venue'   then (select id from venues where id = a.entity_id)
  when 'court'   then (select venue_id from courts   where id = a.entity_id)
  when 'coach'   then (select venue_id from coaches  where id = a.entity_id)
  when 'closure' then (select venue_id from closures where id = a.entity_id)
  when 'booking' then (select c.venue_id from bookings b join courts c on c.id = b.court_id where b.id = a.entity_id)
  when 'profile' then (select venue_id from profiles where id = a.entity_id)
  else null
end
where a.venue_id is null;

create index if not exists audit_log_venue_created_idx on audit_log (venue_id, created_at desc);
