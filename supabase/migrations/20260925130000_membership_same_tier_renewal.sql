-- Same-tier renewal only. Because tiers unlock different real-world services at the venue, a member's
-- held tier must always match what they paid for. So: while a member has an active membership, they
-- may only submit a request for the SAME tier (a renewal, which extends from the current end date).
-- Changing tiers mid-term is handled by the venue/admin, not self-serve.

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

  -- Same-tier-only: if they already hold an active membership, it must be the same tier (renewal).
  v_today := (now() at time zone coalesce(v_venue.timezone, 'Asia/Manila'))::date;
  select tier into v_active_tier from memberships
  where profile_id = v_uid and venue_id = v_plan.venue_id and status = 'active'
    and (ends_on is null or ends_on >= v_today)
  order by ends_on desc nulls first
  limit 1;
  if v_active_tier is not null and v_active_tier <> v_plan.name then
    raise exception 'TIER_LOCKED' using errcode = 'P0001';
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

-- Approval: same tier extends from the current end date; a different tier (only reachable via an
-- admin override, since self-serve is blocked above) switches the tier and starts a fresh term —
-- never silently mislabels the held tier.
create or replace function review_membership_request(
  p_request uuid,
  p_approve boolean,
  p_notes text default null
)
returns membership_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_req    membership_requests;
  v_tz     text;
  v_today  date;
  v_active memberships;
begin
  select * into v_req from membership_requests where id = p_request;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not is_admin_of(v_req.venue_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'ALREADY_REVIEWED' using errcode = 'P0001';
  end if;

  if p_approve then
    select timezone into v_tz from venues where id = v_req.venue_id;
    v_today := (now() at time zone coalesce(v_tz, 'Asia/Manila'))::date;

    select * into v_active from memberships
    where profile_id = v_req.profile_id and venue_id = v_req.venue_id and status = 'active'
      and (ends_on is null or ends_on >= v_today)
    order by ends_on desc nulls first
    limit 1;

    if found then
      if v_active.tier = v_req.tier then
        -- Renewal: extend from current end (a lifetime membership needs no extension).
        if v_active.ends_on is not null then
          update memberships set ends_on = v_active.ends_on + v_req.duration_days where id = v_active.id;
        end if;
      else
        -- Admin override to a different tier: switch tier, fresh term from today.
        update memberships
        set tier = v_req.tier, starts_on = v_today, ends_on = v_today + v_req.duration_days
        where id = v_active.id;
      end if;
    else
      insert into memberships (profile_id, venue_id, tier, starts_on, ends_on, status)
      values (v_req.profile_id, v_req.venue_id, v_req.tier, v_today, v_today + v_req.duration_days, 'active');
    end if;
  end if;

  update membership_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = v_uid, reviewed_at = now(), review_notes = nullif(btrim(p_notes), '')
  where id = v_req.id
  returning * into v_req;

  return v_req;
end;
$$;

revoke all on function review_membership_request(uuid, boolean, text) from public;
grant execute on function review_membership_request(uuid, boolean, text) to authenticated, service_role;
