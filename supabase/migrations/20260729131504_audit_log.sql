create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (id),
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity, entity_id);
create index audit_log_actor_id_idx on audit_log (actor_id);
