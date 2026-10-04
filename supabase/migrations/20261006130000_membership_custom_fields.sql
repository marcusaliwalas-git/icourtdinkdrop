-- Per-tier dynamic membership fields. A tier can collect extra details at signup (emergency contact,
-- address, spouse, children, …) that vary by tier. Fully additive and non-invasive:
--   * membership_plans.fields  — the tier's declarative field spec (empty [] = no extra fields, so
--     existing tiers behave exactly as before);
--   * membership_requests.details — the captured values, snapshotted with their labels at submit time
--     (like amount_cents/duration_days), so the request stays self-contained if the spec changes later.
-- Entitlement (memberships), pricing, booking and has_active_membership are all untouched.

alter table membership_plans   add column if not exists fields  jsonb not null default '[]'::jsonb;
alter table membership_requests add column if not exists details jsonb not null default '[]'::jsonb;

-- submit_membership_request gains p_details (the captured values, already validated server-side against
-- the tier spec). Single-overload convention: drop the 3-arg form, create the 4-arg one.
drop function if exists submit_membership_request(uuid, text, text);

create or replace function submit_membership_request(
  p_plan uuid,
  p_reference text default null,
  p_slip_path text default null,
  p_details jsonb default '[]'::jsonb
)
returns membership_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid         uuid := auth.uid();
  v_plan        membership_plans;
  v_venue       venues;
  v_today       date;
  v_active_tier text;
  v_amount      integer;
  v_request     membership_requests;
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

  -- Same-tier-only: an existing active membership must be the same tier (renewal).
  v_today := (now() at time zone coalesce(v_venue.timezone, 'Asia/Manila'))::date;
  select tier into v_active_tier from memberships
  where profile_id = v_uid and venue_id = v_plan.venue_id and status = 'active'
    and (ends_on is null or ends_on >= v_today)
  order by ends_on desc nulls first
  limit 1;
  if v_active_tier is not null and v_active_tier <> v_plan.name then
    raise exception 'TIER_LOCKED' using errcode = 'P0001';
  end if;

  -- Effective price: sale price when set and below the regular price, else the regular price.
  v_amount := case
    when v_plan.sale_price_cents is not null and v_plan.sale_price_cents < v_plan.price_cents
      then v_plan.sale_price_cents
    else v_plan.price_cents
  end;

  insert into membership_requests (
    venue_id, profile_id, tier, amount_cents, duration_days, plan_id, payment_reference, payment_slip_path, details
  ) values (
    v_plan.venue_id, v_uid, v_plan.name, v_amount, v_plan.duration_days, v_plan.id,
    nullif(btrim(p_reference), ''), nullif(btrim(p_slip_path), ''),
    case when jsonb_typeof(p_details) = 'array' then p_details else '[]'::jsonb end
  )
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function submit_membership_request(uuid, text, text, jsonb) from public;
grant execute on function submit_membership_request(uuid, text, text, jsonb) to authenticated, service_role;
