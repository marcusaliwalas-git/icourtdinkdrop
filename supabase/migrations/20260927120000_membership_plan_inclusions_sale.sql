-- Membership tiers can now list what's included and run a sale price. `inclusions` is a list of
-- perk lines shown to members; `sale_price_cents` (when set and below price) is the promo price they
-- actually pay. Both are additive/nullable.
alter table membership_plans add column if not exists inclusions text[] not null default '{}';
alter table membership_plans add column if not exists sale_price_cents integer;

-- Submit snapshots the EFFECTIVE price onto the request (sale price when a valid sale is set), so the
-- member is charged/recorded at the sale price. Same signature — create-or-replace keeps one overload.
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
    venue_id, profile_id, tier, amount_cents, duration_days, plan_id, payment_reference, payment_slip_path
  ) values (
    v_plan.venue_id, v_uid, v_plan.name, v_amount, v_plan.duration_days, v_plan.id,
    nullif(btrim(p_reference), ''), nullif(btrim(p_slip_path), '')
  )
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function submit_membership_request(uuid, text, text) from public;
grant execute on function submit_membership_request(uuid, text, text) to authenticated, service_role;
