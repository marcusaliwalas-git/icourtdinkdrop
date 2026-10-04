# Equipment rental — design

Status: proposal. Goal: let a venue rent out equipment (paddles, ball buckets, ball machines, …) by
the hour as an add-on to a court booking, with real inventory limits so a venue never rents out more
of an item than it owns.

Guiding idea: equipment rental is the existing **coach add-on** (a per-hour extra attached to a
booking) plus **inventory** — a finite stock per item that must be checked against overlapping
rentals. Reuse the coach + receipt-breakdown + capability-flag patterns; add a capacity check.

See also: `docs/promotions-design.md` (same shape — catalog table + line items + RPC extension + admin
tab).

---

## 1. Where it fits in today's system

| Concern | Existing pattern to reuse |
|---|---|
| Per-venue catalog of rentable things | `coaches` table (name, hourly_rate_cents, is_active, sort_order) |
| Per-hour add-on fee on a booking | `bookings.coach_fee_cents`, computed in `create_bookings` |
| Atomic multi-slot cart | `create_bookings(p_segments, …)` — one transaction, one `booking_group_id` |
| No double-booking | `no_overlapping_bookings` GiST exclusion constraint on `bookings` |
| Line-item receipt | the per-slot breakdown in the customer / walk-in / payments review cards |
| Optional capability | feature flags (`coaches`, `official_members`) toggled from the superadmin **Capabilities** panel |

The one genuinely new thing is **inventory availability** (§3).

---

## 2. Data model

```sql
-- supabase/migrations/<ts>_equipment_rental.sql

-- A per-venue catalog of rentable equipment. Mirrors `coaches`, plus `stock` (the inventory cap).
create table equipment (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  name text not null,                       -- "Paddle", "Ball bucket", "Ball machine"
  hourly_rate_cents integer not null check (hourly_rate_cents >= 0), -- price per unit, per hour
  stock integer not null check (stock >= 0),-- how many units the venue owns
  max_per_booking integer check (max_per_booking is null or max_per_booking > 0), -- optional cap
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index equipment_venue_active_idx on equipment (venue_id) where is_active;

-- A rental line on a booking: "2 paddles for this slot". time_range is denormalized from the booking
-- so availability can be checked with a single indexed overlap query.
create table booking_equipment (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  equipment_id uuid not null references equipment (id),
  quantity integer not null check (quantity > 0),
  time_range tstzrange not null,
  fee_cents integer not null check (fee_cents >= 0)
);
-- Overlap queries filter by equipment_id then range — a compound GiST index serves both.
create index booking_equipment_avail_idx on booking_equipment using gist (equipment_id, time_range);
create index booking_equipment_booking_idx on booking_equipment (booking_id);

alter table equipment enable row level security;
alter table booking_equipment enable row level security;

-- Admins manage their venue's catalog; the catalog is publicly readable for the booking page.
create policy equipment_admin_all on equipment
  for all using (can_admin_venue(venue_id)) with check (can_admin_venue(venue_id));
create policy equipment_public_read on equipment
  for select using (is_active);

-- booking_equipment follows the booking's own visibility (staff of the court's venue, or the booker).
create policy booking_equipment_select on booking_equipment
  for select using (
    exists (select 1 from bookings b where b.id = booking_id
            and (b.booked_by = auth.uid() or is_staff_of(court_venue(b.court_id))))
  );
-- Writes go only through the SECURITY DEFINER RPC (§4); no direct client insert policy.
```

Capability flag (super-admin, via the Capabilities panel, like `coaches`):
`venues.features.equipment = true`.

Cancelled/voided bookings keep their `booking_equipment` rows but **must not count against stock** —
the availability query filters by booking status (§3).

---

## 3. Inventory availability — the capacity model

Courts are a binary overlap (one court can't overlap itself → exclusion constraint). Equipment is a
**capacity** problem: "are at least N of this item free for this time range?" That can't be expressed
as an exclusion constraint (it's a *sum of quantities ≤ stock*, not a pairwise overlap), so the check
lives in the RPC, serialized with a row lock.

**Availability for an item over `[start, end)`:**

```
available = stock − coalesce(sum(be.quantity) over overlapping, active-booking rentals, 0)
```

```sql
-- Units of an item already committed over a time range (only live bookings count).
create or replace function equipment_rented_qty(p_equipment uuid, p_range tstzrange)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(be.quantity), 0)::int
  from booking_equipment be
  join bookings b on b.id = be.booking_id
  where be.equipment_id = p_equipment
    and be.time_range && p_range
    and b.status in ('pending', 'confirmed', 'completed', 'no_show') -- not cancelled/voided
$$;
```

**Concurrency:** two customers renting the last paddle at the same time must not both succeed. The RPC
takes a row lock on the `equipment` row before the capacity check, which serializes rentals of that
one item:

```
select * from equipment where id = :id and is_active for update;   -- serialize per item
if requested + equipment_rented_qty(:id, :range) > stock then
  raise 'EQUIPMENT_UNAVAILABLE';
```

Because the lock is per equipment row, concurrent rentals of *different* items don't block each other;
only contention on the *same* item serializes — exactly where it must.

> Alternative for a few individually-tracked, high-value units (e.g. 2 named ball machines): a **unit
> model** — each physical unit is its own row and you reuse the court-style exclusion constraint on
> `(unit_id, time_range)`. More rows and assignment logic; only worth it if a venue needs to know
> *which* machine. The capacity model above already covers machines as `stock = N`, so start there.

---

## 4. Pricing + the RPC

Equipment fee per line = `hourly_rate_cents × quantity × hours`. It adds to the booking total exactly
like the coach fee, and is recorded per line so it shows in the receipt breakdown.

Extend `create_bookings` with `p_equipment` (kept a single overload, like the other add-ons):

```
create_bookings(p_segments, …, p_coach_id, p_payment_method, p_payment_remarks,
                p_equipment jsonb default '[]')   -- [{ "equipment_id": uuid, "quantity": int }]
```

Inside the existing atomic cart transaction, after the segment loop (next to the coach-fee block):

```
for each item in p_equipment:
  select * into v_eq from equipment where id = item.equipment_id and venue = cart venue and is_active for update;
  if not found: raise 'EQUIPMENT_NOT_FOUND';
  if v_eq.max_per_booking is not null and item.quantity > v_eq.max_per_booking: raise 'EQUIPMENT_LIMIT';
  -- Availability over the cart's span (see §6 for per-slot vs per-cart).
  if item.quantity + equipment_rented_qty(v_eq.id, v_range) > v_eq.stock: raise 'EQUIPMENT_UNAVAILABLE';
  v_fee := round(v_eq.hourly_rate_cents * item.quantity * v_minutes / 60.0);
  insert into booking_equipment (booking_id, equipment_id, quantity, time_range, fee_cents)
    values (v_first_booking, v_eq.id, item.quantity, v_range, v_fee);
  update bookings set total_cents = total_cents + v_fee where id = v_first_booking;
```

Mirror the single-booking path (`create_booking`) if equipment should be addable to a lone slot /
single walk-in — same capacity check, one line.

Error codes map to friendly messages in `lib/booking-errors.ts`: `EQUIPMENT_UNAVAILABLE` →
"Some equipment was just taken — adjust the quantity and try again."

---

## 5. Availability feed for the UI

So the booking sheet can show live "N available" and disable over-requests, a read-only function the
page calls for the chosen time:

```sql
create or replace function equipment_availability(p_venue uuid, p_range tstzrange)
returns table (id uuid, name text, hourly_rate_cents int, available int)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.hourly_rate_cents,
         e.stock - equipment_rented_qty(e.id, p_range) as available
  from equipment e
  where e.venue_id = p_venue and e.is_active
  order by e.sort_order, e.name
$$;
```

(The estimate is advisory — the authoritative capacity check in §4 is the source of truth, same as
court availability vs. the exclusion constraint.)

---

## 6. Decisions to settle

1. **Attach per court-slot or per whole cart?**
   - *Per slot (recommended):* equipment holds inventory for that slot's exact time range — clean
     availability ("this machine is reserved 3–4 PM") and a precise receipt. The cart UI adds
     equipment to a slot (or "apply to all slots").
   - *Per cart (simpler, like coach):* one equipment selection for the session; availability checked
     over the cart's overall span `[min start, max end]`, which over-reserves across gaps in a
     non-contiguous cart.
   - Recommendation: **per slot** for correct inventory; fall back to per-cart only if the UX proves
     fiddly.
2. **Capacity vs unit model** (§3) — recommend capacity.
3. **Do promotions apply to equipment?** Recommend **no** — exclude the equipment fee from the promo
   discount base (same as the coach fee), so promos stay court-only.
4. **Deposits / returns / damage** — out of scope for v1. Future: a refundable deposit, a
   "returned / damaged" status on `booking_equipment`, and a condition note.
5. **Cancellation refunds equipment?** Cancelling a booking frees its equipment (status filter in §3
   already handles availability); whether the fee is refunded follows the venue's existing booking
   refund policy.

---

## 7. Integration points (reuse, don't rebuild)

- **Receipt breakdown** — equipment lines render in the customer sheet, admin walk-in sheets, and the
  payments review card, next to court and coach lines: "2× Paddle · ₱X", "1× Ball machine · ₱Y".
- **Admin management** — an **Equipment** tab under Venue & Courts (like Membership / Promotions):
  name, hourly rate, stock, optional max-per-booking, active. CRUD server actions audited via
  `auditCurrent` (`equipment_created/updated/deleted`), with an `Equipment` chip on the Audit Log.
- **Capability flag** — gate the tab and the booking-sheet section behind `features.equipment`,
  toggled from the superadmin **Capabilities** panel.
- **Walk-ins** — the admin single + batch walk-in sheets add equipment through the same RPC.
- **Reports** — an "Equipment" revenue breakdown (sum of `booking_equipment.fee_cents` on realized
  bookings), and optionally a utilisation view (how often each item is rented).

---

## 8. Testing

- `equipment_rented_qty` / availability: overlapping vs non-overlapping rentals; cancelled/voided
  excluded; exact-boundary ranges.
- Capacity check: request = available (ok), request = available + 1 (rejected), concurrent rentals of
  the last unit (exactly one succeeds — the row-lock test, like the booking-concurrency test).
- Pricing: fee = rate × qty × hours, rounding on part-hours; total includes equipment.
- `max_per_booking` enforced.

---

## 9. Rollout

1. **Migration** — `equipment` + `booking_equipment` + RLS + `equipment_rented_qty` +
   `equipment_availability`; `features.equipment` capability.
2. **RPC** — extend `create_bookings` (and optionally `create_booking`) with capacity-checked
   `p_equipment`; booking-errors mapping.
3. **Admin Equipment tab** — CRUD + audit.
4. **Booking sheet** — "Add equipment" with quantity steppers + live availability; receipt lines.
5. **Walk-ins + reports.**

Each step is small and isolated, and every surface it touches (catalog table, line items, RPC add-on,
admin tab, receipt) already has a working precedent in the codebase.
