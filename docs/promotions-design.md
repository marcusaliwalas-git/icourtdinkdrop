# Promotions / discounts — design

Status: proposal. Goal: let each venue run **many kinds of promotions**, with **more types added over
time**, without a schema change or a rewrite of the pricing core per promo.

The guiding idea: **promos are data + a plugin registry**, not hardcoded branches.

- A `promotions` table stores each venue's promos as rows (`type` + JSONB `config` + schedule).
- A promo-type **registry** in TypeScript defines each type once (config schema, apply logic, admin
  form). Adding a type = one new file + one registry line. No migration.
- A single **promo engine** evaluates whatever rows a venue has against a booking/cart and returns
  discount lines.

---

## 1. Where it fits in today's pricing

Pricing currently lives in three mirrored places (keep this in mind — we do **not** want promos to
become a fourth and fifth):

| Path | File / function | Role |
|---|---|---|
| Single booking | `create_booking` (plpgsql) | **authoritative** base price (sum of `court_rate_periods`) |
| Cart / batch | `create_bookings` (plpgsql) | loops `create_booking`, then applies a **group-level** adjustment (coach fee) |
| Estimate | `src/lib/pricing.ts` `computeBookingTotalCents` | TS mirror so the pre-submit total matches the charge |

Promos attach as a **discount layer on top of the DB-authoritative base**:

- **Base rate stays in the DB** (`create_booking`) — untampered, source of truth.
- **Promo logic lives only in TS** (the engine), computed server-side, and the result is **recorded**
  on the booking (`discount_cents`, `discount_label`, `promotion_id`). This is the "option B" decision
  from the recommendation: one implementation per promo type instead of plpgsql + a TS mirror.

See §7 for the trust boundary this creates and its guardrail.

---

## 2. Data model

```sql
-- supabase/migrations/<ts>_promotions.sql

create table promotions (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues (id) on delete cascade,
  name        text not null,                      -- admin label, shown on receipts
  type        text not null,                      -- registry key: 'volume_discount', 'free_hours', …
  config      jsonb not null default '{}'::jsonb, -- type-specific params (validated in TS)
  eligibility text not null default 'all'
              check (eligibility in ('all', 'members_only', 'guests_only')),
  stackable   boolean not null default false,     -- may combine with other stackable promos
  priority    integer not null default 0,         -- tiebreak / ordering (higher first)
  active      boolean not null default true,
  starts_on   date,                               -- optional campaign window (venue-local)
  ends_on     date,
  created_at  timestamptz not null default now()
);

create index promotions_venue_active_idx on promotions (venue_id) where active;

alter table promotions enable row level security;

-- Admins manage their venue's promos; the engine reads them server-side.
create policy promotions_admin_all on promotions
  for all using (can_admin_venue(venue_id)) with check (can_admin_venue(venue_id));
-- Read access for pricing the public cart (promos are not secret; they appear on the booking page).
create policy promotions_public_read on promotions
  for select using (active);
```

`type` + `config` is the extensibility seam — the table never changes when a new promo kind is added.
`eligibility`, `stackable`, `priority` are columns because **every** type shares them (don't repeat
them inside each `config`).

Record the outcome on the booking (mirrors the existing `coach_fee_cents` pattern):

```sql
-- same migration
alter table bookings
  add column discount_cents integer not null default 0 check (discount_cents >= 0),
  add column discount_label text,
  add column promotion_id   uuid references promotions (id);
```

Discount is stored **per booking row** (per court-slot), so per-court sales reporting stays accurate —
unlike `coach_fee`, which is lumped onto the first row because it's a single cart-wide add-on.

---

## 3. Engine interface

```ts
// src/lib/promos/engine.ts
import type { ZodType } from "zod";

export type PromoEligibility = "all" | "members_only" | "guests_only";

/** A promotions row, as loaded for a venue. `config` is validated by its type's schema at apply time. */
export interface PromoRow {
  id: string;
  name: string;
  type: string;
  config: unknown;
  eligibility: PromoEligibility;
  stackable: boolean;
  priority: number;
  startsOn: string | null; // 'YYYY-MM-DD'
  endsOn: string | null;
}

/** One priced court-slot. Same shape for a single booking (one segment) and a cart (many). */
export interface PromoSegment {
  courtId: string;
  startsAtIso: string;
  durationMinutes: number;
  baseTotalCents: number; // DB-authoritative base for this slot (from create_booking / pricing.ts)
}

export interface PromoContext {
  venueId: string;
  timezone: string;
  isMember: boolean;
  onDateIso: string;      // venue-local date the booking is made/for — for the schedule window
  segments: PromoSegment[];
}

/** A discount to subtract from one segment. The engine never returns a negative total. */
export interface DiscountLine {
  segmentIndex: number;   // index into ctx.segments
  cents: number;          // positive amount to subtract (already capped to the segment base)
  promotionId: string;
  label: string;          // e.g. "Multi-court discount"
}

/** A promo type: defined once, drives the engine AND the admin form. */
export interface PromoType<C = unknown> {
  key: string;
  label: string;
  scope: "booking" | "cart"; // 'cart' types need to see all segments (e.g. count courts)
  configSchema: ZodType<C>;
  /** Pure function. Return the discount lines this promo produces for this context (may be empty). */
  apply(ctx: PromoContext, cfg: C, promo: PromoRow): DiscountLine[];
  /** Declarative form spec so the admin UI is generated, not hand-built per type. */
  formFields: PromoFormField[];
}

export interface PromoFormField {
  name: string;                 // config key
  label: string;
  kind: "number" | "money" | "time" | "select" | "weekdays";
  required?: boolean;
  options?: { value: string; label: string }[];
  help?: string;
}
```

### Registry

```ts
// src/lib/promos/registry.ts
import { volumeDiscount } from "./types/volume-discount";
// import { freeHours } from "./types/free-hours";  // added later — one line

export const PROMO_TYPES = {
  [volumeDiscount.key]: volumeDiscount,
  // [freeHours.key]: freeHours,
} as const;
```

### Evaluation + stacking resolution

```ts
// src/lib/promos/engine.ts (cont.)
import { PROMO_TYPES } from "./registry";

export function evaluatePromotions(ctx: PromoContext, promos: PromoRow[]): DiscountLine[] {
  // 1. Filter: schedule window + member eligibility.
  const applicable = promos.filter(
    (p) => withinWindow(ctx.onDateIso, p.startsOn, p.endsOn) && eligibilityMatches(p, ctx.isMember)
  );

  // 2. Run each type's handler, capping every line to its segment's base (never below 0).
  const results = applicable
    .map((p) => {
      const type = PROMO_TYPES[p.type as keyof typeof PROMO_TYPES];
      if (!type) return { promo: p, lines: [] as DiscountLine[] };
      const cfg = type.configSchema.parse(p.config);
      const lines = type.apply(ctx, cfg, p).map((l) => ({
        ...l,
        cents: Math.max(0, Math.min(l.cents, ctx.segments[l.segmentIndex].baseTotalCents)),
      }));
      return { promo: p, lines: lines.filter((l) => l.cents > 0) };
    })
    .filter((r) => r.lines.length > 0);

  // 3. Stacking: see §4. Default = "best total discount for the customer".
  return resolveStacking(ctx, results);
}

function eligibilityMatches(p: PromoRow, isMember: boolean): boolean {
  return (
    p.eligibility === "all" ||
    (p.eligibility === "members_only" && isMember) ||
    (p.eligibility === "guests_only" && !isMember)
  );
}

function withinWindow(onDateIso: string, startsOn: string | null, endsOn: string | null): boolean {
  if (startsOn && onDateIso < startsOn) return false;
  if (endsOn && onDateIso > endsOn) return false;
  return true;
}
```

---

## 4. Member eligibility and stacking — the rules

### Member eligibility (`eligibility` column)

Set per promo:

- `all` — members and guests both get it, **on top of** whatever base they pay (members keep their
  member rate and also get the promo).
- `members_only` — a member perk; guests don't see it.
- `guests_only` — non-members only. **This is also how you express "don't stack a promo on top of the
  member rate"**: members already have the member rate, so excluding them here keeps the two from
  combining — without any special global flag.

The engine filters on this before applying anything (`eligibilityMatches`). `isMember` is resolved
once per booking/cart from the booker (same `has_active_membership` signal the pricing path uses).

### Stacking (`stackable` + `priority`)

Each promo declares whether it may combine with others:

- `stackable = false` (default) — **exclusive**: this promo cannot be combined with any other.
- `stackable = true` — may combine with other stackable promos (their discounts sum).

When several promos apply at once, the engine resolves them with a **best-for-the-customer** policy
(predictable and order-independent):

```ts
function resolveStacking(
  ctx: PromoContext,
  results: { promo: PromoRow; lines: DiscountLine[] }[]
): DiscountLine[] {
  const total = (rs: { lines: DiscountLine[] }[]) =>
    rs.reduce((t, r) => t + r.lines.reduce((s, l) => s + l.cents, 0), 0);

  const stackables = results.filter((r) => r.promo.stackable);
  const exclusives = results.filter((r) => !r.promo.stackable);

  // Candidate A: all stackable promos combined.
  const stackTotal = total(stackables);

  // Candidate B: the single best exclusive promo (ties broken by priority).
  const bestExclusive = exclusives.sort(
    (a, b) => total([b]) - total([a]) || b.promo.priority - a.promo.priority
  )[0];
  const exclusiveTotal = bestExclusive ? total([bestExclusive]) : 0;

  const chosen = exclusiveTotal > stackTotal ? [bestExclusive] : stackables;
  return chosen.flatMap((r) => r.lines);
}
```

Rules in words:
- All applicable **stackable** promos combine (sum of discounts) → candidate A.
- The best single **exclusive** promo is candidate B.
- The customer gets whichever yields the **larger total discount**. `priority` only breaks ties
  between exclusives.
- Every line is already capped to its segment base, and the sum can never push a segment below ₱0.

> Alternative policy (if a venue prefers deterministic order over best-value): apply exclusives by
> `priority` and stop at the first match. This is a one-function swap in `resolveStacking`; it can be a
> venue setting later. Recommended default is best-value — it's the least surprising for customers.

---

## 5. The `volume_discount` handler

> "3 courts and above → ₱50/hour off per court."

```ts
// src/lib/promos/types/volume-discount.ts
import { z } from "zod";
import type { PromoType, DiscountLine } from "../engine";

const configSchema = z.object({
  minCourts: z.number().int().min(2),      // threshold of DISTINCT courts in the cart
  centsOffPerHour: z.number().int().min(1), // discount per hour, per court-slot
});

export const volumeDiscount: PromoType<z.infer<typeof configSchema>> = {
  key: "volume_discount",
  label: "Multi-court discount",
  scope: "cart", // needs to see the whole cart to count courts
  configSchema,

  apply(ctx, cfg, promo): DiscountLine[] {
    // Threshold is on DISTINCT courts (booking the same court twice is still "one court").
    const distinctCourts = new Set(ctx.segments.map((s) => s.courtId)).size;
    if (distinctCourts < cfg.minCourts) return [];

    // Discount applies per court-slot: ₱X/hr × that slot's hours.
    return ctx.segments.map((seg, i) => ({
      segmentIndex: i,
      cents: Math.round((cfg.centsOffPerHour * seg.durationMinutes) / 60),
      promotionId: promo.id,
      label: promo.name, // e.g. "Multi-court discount"
    }));
  },

  formFields: [
    { name: "minCourts", label: "Minimum courts", kind: "number", required: true,
      help: "Distinct courts in one booking to qualify (e.g. 3)." },
    { name: "centsOffPerHour", label: "Discount per hour", kind: "money", required: true,
      help: "Taken off each court, per hour (e.g. ₱50)." },
  ],
};
```

Defined decisions (document them so they're not re-litigated):
- **Threshold = distinct courts**, so two slots on the same court don't count as two.
- **Discount scope = per court-slot per hour**, so a 3-court × 2-hour cart at ₱50/hr gets
  3 × 2 × ₱50 = ₱300 off total, recorded ₱100 on each booking row.
- Eligibility/stacking come from the row's columns, not this handler — so the *same* type can be a
  guests-only exclusive promo at one venue and an everyone, stackable promo at another.

---

## 6. Wiring it in

### Estimate (pre-submit, `src/app/book`)

The cart already sums `computeBookingTotalCents` per segment. Add:

```ts
const segments = cart.map((s) => ({
  courtId: s.courtId,
  startsAtIso: s.startsAtIso,
  durationMinutes: s.durationMinutes,
  baseTotalCents: computeBookingTotalCents({ ...s, ratePeriods, baseHourlyRateCents, baseMemberRateCents, isMember }),
}));
const lines = evaluatePromotions({ venueId, timezone, isMember, onDateIso, segments }, venuePromos);
const discount = lines.reduce((t, l) => t + l.cents, 0);
const total = segments.reduce((t, s) => t + s.baseTotalCents, 0) - discount;
// show the discount as its own line so the customer sees why.
```

### Authoritative write (`create_bookings`)

`create_bookings` computes the base per segment (unchanged). Add a `p_discounts jsonb default '[]'`
parameter carrying the engine's lines `[{ court_id | index, cents, promotion_id, label }]`; after the
loop (next to the coach-fee block) it records them atomically:

```sql
-- pseudocode, inside create_bookings, after the segment loop
for each d in p_discounts loop
  update bookings
    set discount_cents = d.cents,
        discount_label = d.label,
        promotion_id   = d.promotion_id,
        total_cents    = greatest(0, total_cents - d.cents)
  where id = v_ids[d.index];
end loop;
-- GUARDRAIL (see §7): reject if total discount exceeds the venue's max, e.g.
--   if sum(d.cents) > round(sum(base) * v_venue.max_discount_pct / 100) then raise 'DISCOUNT_TOO_LARGE'
```

The single-booking admin walk-in path (`create_booking` direct) can take the same treatment later for
`scope: "booking"` promos (e.g. `free_hours`); volume discount is cart-scoped so it only needs
`create_bookings`.

---

## 7. Trust boundary (important)

Because promo math is computed in TS and passed to a `SECURITY DEFINER` RPC, a caller hitting the RPC
directly could supply a fabricated `p_discounts`. Mitigations, in order:

1. **Online bookings are already admin-verified.** Customer carts land as `pending` /
   `awaiting_verification` with a payment slip; an admin reviews the total before confirming, so a
   tampered discount is caught. Walk-ins are staff-only.
2. **A cheap SQL guardrail** in `create_bookings`: cap the total discount at a venue-configured
   percentage of the base (`venues.max_discount_pct`, default e.g. 60). This bounds abuse without
   reimplementing the engine in plpgsql.
3. If a venue ever needs hard enforcement, that specific promo type can additionally be validated in
   SQL — but we only pay that cost where it's actually required, not for every type.

The DB remains the sole authority for the **base rate** and for **no double-booking**; only the
discount is server-computed.

---

## 8. Testing

The engine and every handler are **pure functions** → straightforward unit tests (impossible to do
cleanly in plpgsql):

- `volume_discount`: below threshold → no lines; at/above → correct per-slot cents; same-court-twice
  counts as one court; rounding of odd durations.
- `resolveStacking`: stackable sum vs best exclusive; tie broken by priority; caps never go negative.
- `eligibilityMatches` / `withinWindow`: member/guest/all × in/out of window.

---

## 9. Rollout

1. **Migration** — `promotions` table + `bookings.discount_cents/discount_label/promotion_id` +
   `venues.max_discount_pct`. (One migration, once.)
2. **Engine + registry scaffold** — `src/lib/promos/{engine,registry}.ts`, wired into the cart
   estimate and `create_bookings` discount recording + guardrail.
3. **First type** — `volume_discount` handler + its admin form. Proves the whole pipeline end-to-end.
4. **Admin UI** — a Promotions tab that lists a venue's promos and adds one by picking a type (form
   generated from `formFields`), with active/schedule/eligibility/stackable controls.
5. **Future types** (e.g. `free_hours` 6am–1pm, `percent_off`, `happy_hour`) are each one file in
   `src/lib/promos/types/` + one registry line — no migration, no pricing-core change.
```
