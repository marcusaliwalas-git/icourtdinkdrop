-- Let the membership itself carry the member's current custom-field details, so members who subscribed
-- before a tier defined its fields can still provide them — without waiting for a renewal. Three capture
-- paths write here: self-serve (this file's update_membership_details RPC), admin on-behalf (direct
-- write under the existing admin RLS), and renewal (review_membership_request copies the request's
-- snapshot across on approval). Additive: defaults to [] so existing memberships are unchanged.

alter table memberships add column if not exists details jsonb not null default '[]'::jsonb;

-- On approval, carry the request's captured details onto the member's membership (new or renewed).
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
      -- Renewal: extend from the current end date (a lifetime membership needs no extension), and carry
      -- over the newly captured details when the request supplied any.
      update memberships
      set ends_on = case when v_active.ends_on is not null then v_active.ends_on + v_req.duration_days else v_active.ends_on end,
          details = case when jsonb_array_length(coalesce(v_req.details, '[]'::jsonb)) > 0 then v_req.details else details end
      where id = v_active.id;
    else
      insert into memberships (profile_id, venue_id, tier, starts_on, ends_on, status, details)
      values (v_req.profile_id, v_req.venue_id, v_req.tier, v_today, v_today + v_req.duration_days, 'active',
              coalesce(v_req.details, '[]'::jsonb));
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

-- Self-serve: a member fills in (or updates) their own membership details any time while active. Writes
-- only the details column of their own active membership — members have no direct write on memberships.
create or replace function update_membership_details(p_venue uuid, p_details jsonb)
returns memberships
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_tz    text;
  v_today date;
  v_m     memberships;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN' using errcode = 'P0001';
  end if;
  select timezone into v_tz from venues where id = p_venue;
  v_today := (now() at time zone coalesce(v_tz, 'Asia/Manila'))::date;

  select * into v_m from memberships
  where profile_id = v_uid and venue_id = p_venue and status = 'active'
    and (ends_on is null or ends_on >= v_today)
  order by ends_on desc nulls first
  limit 1;
  if not found then
    raise exception 'NO_ACTIVE_MEMBERSHIP' using errcode = 'P0001';
  end if;

  update memberships
  set details = case when jsonb_typeof(p_details) = 'array' then p_details else '[]'::jsonb end
  where id = v_m.id
  returning * into v_m;

  return v_m;
end;
$$;

revoke all on function update_membership_details(uuid, jsonb) from public;
grant execute on function update_membership_details(uuid, jsonb) to authenticated, service_role;
