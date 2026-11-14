-- Equipment rental: let a venue rent out paddles, ball buckets, ball machines, etc. by the hour as an
-- add-on to a court booking, with real inventory limits. Models the coach add-on + a capacity check.
-- See docs/equipment-rental-design.md.

-- A per-venue catalog of rentable equipment (mirrors `coaches`, plus `stock` = the inventory cap).
create table equipment (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  name text not null,
  hourly_rate_cents integer not null check (hourly_rate_cents >= 0), -- price per unit, per hour
  stock integer not null check (stock >= 0),                        -- how many units the venue owns
  max_per_booking integer check (max_per_booking is null or max_per_booking > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index equipment_venue_active_idx on equipment (venue_id) where is_active;

-- Rental lines on a booking ("2 paddles for this slot"). time_range is denormalized from the booking
-- so availability is a single indexed overlap query.
create table booking_equipment (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  equipment_id uuid not null references equipment (id),
  quantity integer not null check (quantity > 0),
  time_range tstzrange not null,
  fee_cents integer not null check (fee_cents >= 0)
);
create index booking_equipment_avail_idx on booking_equipment using gist (equipment_id, time_range);
create index booking_equipment_booking_idx on booking_equipment (booking_id);

alter table equipment enable row level security;
alter table booking_equipment enable row level security;

-- Admins manage their venue's catalog; active items are publicly readable for the booking page.
create policy equipment_admin_all on equipment
  for all using (can_admin_venue(venue_id)) with check (can_admin_venue(venue_id));
create policy equipment_public_read on equipment
  for select using (is_active);

-- booking_equipment follows the booking's own visibility (staff of the court's venue, or the booker).
create policy booking_equipment_select on booking_equipment
  for select using (
    exists (
      select 1 from bookings b
      where b.id = booking_id and (b.booked_by = auth.uid() or is_staff_of(court_venue(b.court_id)))
    )
  );
-- Writes go only through the SECURITY DEFINER create_bookings RPC — no direct client write policy.

-- Units of an item already committed over a time range. Only live bookings hold stock; cancelled and
-- voided ones free it.
create or replace function equipment_rented_qty(p_equipment uuid, p_range tstzrange)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(sum(be.quantity), 0)::int
  from booking_equipment be
  join bookings b on b.id = be.booking_id
  where be.equipment_id = p_equipment
    and be.time_range && p_range
    and b.status in ('pending', 'confirmed', 'completed', 'no_show')
$function$;

-- Read-only availability feed for the booking UI: each active item and how many are free for a range.
create or replace function equipment_availability(p_venue uuid, p_range tstzrange)
returns table (id uuid, name text, hourly_rate_cents integer, max_per_booking integer, available integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.id, e.name, e.hourly_rate_cents, e.max_per_booking,
         (e.stock - equipment_rented_qty(e.id, p_range))::int as available
  from equipment e
  where e.venue_id = p_venue and e.is_active
  order by e.sort_order, e.name
$function$;

revoke all on function equipment_availability(uuid, tstzrange) from public;
grant execute on function equipment_availability(uuid, tstzrange) to anon, authenticated, service_role;
revoke all on function equipment_rented_qty(uuid, tstzrange) from public;
grant execute on function equipment_rented_qty(uuid, tstzrange) to anon, authenticated, service_role;
