-- Self-serve official-membership purchase: a member uploads a transfer receipt to request a
-- subscription; an admin reviews it (Admin > People > Subscription Requests) and approves, which
-- grants/extends their membership. Non-invasive: gated by the official_members capability, the
-- entitlement stays in `memberships` (has_active_membership etc. unchanged), and the request table
-- is just the approval inbox. Nothing here touches booking, pricing, or the manual admin grant.

-- 1) One membership plan per venue: price + term. Nullable — a venue with no plan configured can't
--    take self-serve requests (the submit RPC refuses).
alter table venues add column if not exists membership_price_cents integer;
alter table venues add column if not exists membership_duration_days integer;

-- 2) The approval inbox. amount_cents/duration_days are snapshotted from the plan at submit time so
--    a later price change never rewrites a pending request or history.
create table if not exists membership_requests (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  tier text not null default 'official',
  amount_cents integer not null,
  duration_days integer not null,
  payment_reference text,
  payment_slip_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_notes text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists membership_requests_venue_status_idx on membership_requests (venue_id, status);
create index if not exists membership_requests_profile_idx on membership_requests (profile_id);

alter table membership_requests enable row level security;

-- A member sees their own requests; an admin sees their venue's.
create policy membership_requests_select on membership_requests
  for select using (profile_id = auth.uid() or is_admin_of(venue_id));
-- A member may only file requests for themselves (the RPC snapshots the price server-side).
create policy membership_requests_insert on membership_requests
  for insert with check (profile_id = auth.uid());
-- Only a venue admin edits (review happens via the RPC below, which is security definer).
create policy membership_requests_admin_update on membership_requests
  for update using (is_admin_of(venue_id)) with check (is_admin_of(venue_id));

grant select, insert, update on membership_requests to authenticated, service_role;

-- 3) Submit a request — snapshots the plan, enforces the feature flag and one-pending-at-a-time.
create or replace function submit_membership_request(
  p_venue uuid,
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
  v_venue    venues;
  v_request  membership_requests;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN' using errcode = 'P0001';
  end if;

  select * into v_venue from venues where id = p_venue;
  if not found then
    raise exception 'VENUE_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- official_members defaults on; disabled only when explicitly stored false.
  if (v_venue.features ->> 'official_members') = 'false' then
    raise exception 'FEATURE_DISABLED' using errcode = 'P0001';
  end if;
  if v_venue.membership_price_cents is null or v_venue.membership_duration_days is null then
    raise exception 'PLAN_NOT_CONFIGURED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from membership_requests
    where profile_id = v_uid and venue_id = p_venue and status = 'pending'
  ) then
    raise exception 'REQUEST_PENDING' using errcode = 'P0001';
  end if;

  insert into membership_requests (
    venue_id, profile_id, tier, amount_cents, duration_days, payment_reference, payment_slip_path
  ) values (
    p_venue, v_uid, 'official', v_venue.membership_price_cents, v_venue.membership_duration_days,
    nullif(btrim(p_reference), ''), nullif(btrim(p_slip_path), '')
  )
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function submit_membership_request(uuid, text, text) from public;
grant execute on function submit_membership_request(uuid, text, text) to authenticated, service_role;

-- 4) Review a request. Approve grants (or, for a renewal, extends from the current end date) the
--    membership and marks it approved; reject records the reason. Admin-only.
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
  v_uid       uuid := auth.uid();
  v_req       membership_requests;
  v_tz        text;
  v_today     date;
  v_active    memberships;
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

    -- Current active membership, if any (drives renewal-extends-from-end).
    select * into v_active from memberships
    where profile_id = v_req.profile_id and venue_id = v_req.venue_id and status = 'active'
      and (ends_on is null or ends_on >= v_today)
    order by ends_on desc nulls last
    limit 1;

    if found then
      -- Renewal: extend from the current end date so no paid days are lost. A lifetime (null
      -- ends_on) membership needs no extension.
      if v_active.ends_on is not null then
        update memberships set ends_on = v_active.ends_on + v_req.duration_days where id = v_active.id;
      end if;
    else
      insert into memberships (profile_id, venue_id, tier, starts_on, ends_on, status)
      values (v_req.profile_id, v_req.venue_id, v_req.tier, v_today, v_today + v_req.duration_days, 'active');
    end if;
  end if;

  update membership_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = v_uid,
      reviewed_at = now(),
      review_notes = nullif(btrim(p_notes), '')
  where id = v_req.id
  returning * into v_req;

  return v_req;
end;
$$;

revoke all on function review_membership_request(uuid, boolean, text) from public;
grant execute on function review_membership_request(uuid, boolean, text) to authenticated, service_role;
