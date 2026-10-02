-- Membership tiers: let a venue offer several plans (e.g. Basic, Pro) instead of one. Replaces the
-- single price/term on venues with a membership_plans table. Non-invasive: the entitlement still
-- lives in `memberships`; requests still gate on the official_members capability.

create table if not exists membership_plans (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  name text not null,
  price_cents integer not null,
  duration_days integer not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists membership_plans_venue_idx on membership_plans (venue_id, sort_order);

alter table membership_plans enable row level security;
-- Plans are public info for the venue's members (like court rates); admins manage them.
create policy membership_plans_select on membership_plans for select using (true);
create policy membership_plans_admin_write on membership_plans
  for all using (is_admin_of(venue_id)) with check (is_admin_of(venue_id));

grant select on membership_plans to anon, authenticated;
grant insert, update, delete on membership_plans to authenticated;
grant all on membership_plans to service_role;

-- Carry any existing single-plan config over into a default "Official" tier so nothing is lost.
insert into membership_plans (venue_id, name, price_cents, duration_days)
select id, 'Official', membership_price_cents, membership_duration_days
from venues
where membership_price_cents is not null and membership_duration_days is not null;

-- Requests now reference the chosen plan (name/amount/duration stay snapshotted on the request).
alter table membership_requests add column if not exists plan_id uuid references membership_plans(id);

-- Submit now takes a plan id (was a venue id). Same arg types (uuid, text, text) so this stays a
-- single overload — drop the old one first, then recreate.
drop function if exists submit_membership_request(uuid, text, text);

create or replace function submit_membership_request(
  p_plan uuid,
  p_reference text default null,
  p_slip_path text default null
)
returns membership_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid      uuid := auth.uid();
  v_plan     membership_plans;
  v_venue    venues;
  v_request  membership_requests;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN' using errcode = 'P0001';
  end if;

  select * into v_plan from membership_plans where id = p_plan;
  if not found or not v_plan.is_active then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_venue from venues where id = v_plan.venue_id;
  if (v_venue.features ->> 'official_members') = 'false' then
    raise exception 'FEATURE_DISABLED' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from membership_requests
    where profile_id = v_uid and venue_id = v_plan.venue_id and status = 'pending'
  ) then
    raise exception 'REQUEST_PENDING' using errcode = 'P0001';
  end if;

  insert into membership_requests (
    venue_id, profile_id, tier, amount_cents, duration_days, plan_id, payment_reference, payment_slip_path
  ) values (
    v_plan.venue_id, v_uid, v_plan.name, v_plan.price_cents, v_plan.duration_days, v_plan.id,
    nullif(btrim(p_reference), ''), nullif(btrim(p_slip_path), '')
  )
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function submit_membership_request(uuid, text, text) from public;
grant execute on function submit_membership_request(uuid, text, text) to authenticated, service_role;
