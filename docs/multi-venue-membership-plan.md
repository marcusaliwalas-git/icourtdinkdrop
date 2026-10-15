# Implementation plan: one person, many venues

Stepped build plan for the design in [`multi-venue-membership-design.md`](multi-venue-membership-design.md).
Each step is one PR, additive and independently deployable; the app keeps working after every step,
and only Step 7 changes isolation behavior. Do them in order.

## Key decision made here: how RLS scopes without a per-request GUC

The design floated a `request_venue()` read from a session GUC. **Prefer instead:** scope policies to
the **row's** venue via `is_member_of(<row>.venue_id)` / `is_admin_of(<row>.venue_id)`, and let the
app narrow to the current host's venue in its `where` clauses (it already does). This avoids setting a
per-request GUC — which is fragile over Supabase's pooled/PostgREST connections — while preserving
isolation:

- A single-venue user is a member of exactly one venue, so RLS still limits them to that venue's rows
  (identical to today).
- A multi-venue user sees only their venues' rows via RLS; the app's per-venue `where` narrows the
  view to the host they're on.

So RLS is the "only your venues" backstop; the app is the "this venue" filter. No GUC, no pooling
foot-gun. (Direct RPCs like `create_booking` are already `security definer` and take the court → they
keep their own venue check.)

---

## Step 1 — Add the tables (migration only, no app change)
- **Migration:** create `venue_memberships (id, profile_id, venue_id, role, unique(profile_id, venue_id))`;
  add `memberships.venue_id` (nullable for now). Backfill `venue_memberships` from
  `profiles (id, venue_id, role) where venue_id is not null`; backfill `memberships.venue_id` from the
  member's `profiles.venue_id`. Add `is_member_of()` / `is_admin_of()` helper functions (defined, not
  yet used by any policy).
- **Tests:** backfill row counts match; helpers return expected booleans.
- **Deploy:** `supabase db push`. Fully additive — nothing reads the new table yet. Zero risk.

## Step 2 — Signup / OAuth dual-write
- **App:** on signup and in the OAuth callback, upsert a `venue_memberships (profile_id, tenant.id,
  'player')` row **in addition to** setting `profiles.venue_id`. Idempotent; never downgrades an
  existing row. Super-admin onboarding and "create your venue" insert the `admin` row too.
- **Tests:** a new signup/onboarding creates the membership row with the right role.
- **Deploy:** app only. Both stores stay in sync from here on.

## Step 3 — `requireAdmin()` dual-read
- **App:** `requireAdmin()` grants admin if the caller has an `admin` row in `venue_memberships` for
  the resolved tenant **or** (fallback) `profiles.role='admin'` + `venue_id` match. `requireSuperAdmin`
  unchanged.
- **Tests:** admin via the new table is allowed; a non-member is redirected.
- **Deploy:** app only. Prepares the flip without changing who's an admin.

## Step 4 — Venue-scoped membership pricing (finish what's started)
- **App/DB:** make the paid-membership lookup venue-aware — `has_active_membership(profile, venue)`
  keyed on `memberships.venue_id`. `create_booking` already gates member pricing on the court's venue
  (see the venue-scoped-pricing change), so wire it to the new venue-aware lookup.
- **Tests:** member gets member rate only at the venue their membership is for; guest rate elsewhere.
- **Deploy:** `supabase db push` (recreates `create_booking`/`has_active_membership`).

## Step 5 — Admin surfaces read `venue_memberships`
- **App:** Members list, Top Customers, and any "who belongs to this venue" query read
  `venue_memberships` for the current tenant (dual-read with the `profiles.venue_id` fallback).
- **Tests:** members list shows exactly the current venue's membership rows.
- **Deploy:** app only.

## Step 6 — Backfill audit & parity check (no code)
- Verify every `profiles.venue_id` has a matching `venue_memberships` row and vice-versa; reconcile any
  drift created since Step 1. Confirm `memberships.venue_id` is populated for all active memberships.
- Gate: do not proceed to Step 7 until parity is 100%.

## Step 7 — Flip RLS to membership-based (the one behavioral change)
- **Migration:** rewrite every tenant-scoped policy from `is_admin() and venue_id = current_user_venue()`
  → `is_admin_of(venue_id)`, and reads `... = current_user_venue()` → `is_member_of(venue_id)`. Tables:
  `venues, courts, operating_hours, closures, court_rate_periods, coaches, sessions, bookings,
  booking_slots, memberships, venue_sections, payment_accounts, audit_log, profiles`. Keep the app's
  per-venue `where` filters (they already narrow to the current host's venue).
- **Tests:** the full isolation suite — an admin of A cannot read/modify B's rows; a member of A+B sees
  both only when the app doesn't filter, and only A on A's host; a single-venue user is unchanged.
- **Deploy:** `supabase db push`. **This is the risky step** — run the isolation tests in CI first, and
  keep the old helpers around one release for quick rollback.

## Step 8 — Enable true multi-venue
- **App:** drop the "your account already has a venue" block in create-venue/onboarding so a person can
  hold `admin`/`player` rows at several venues. If an admin manages more than one venue, add a small
  venue picker in the admin header (or rely on host-based access — you're always scoped to the host
  you're on). Account/profile edits stay on `profiles` (identity), unaffected.
- **Tests:** one account can be `admin` at A and `player` at B; each host scopes correctly.
- **Deploy:** app only.

## Step 9 — Cleanup (after a soak period)
- **Migration:** drop `profiles.venue_id` and `profiles.role`; make `memberships.venue_id` not-null;
  remove `current_user_venue()`/`is_admin()` and the dual-read fallbacks from the app.
- **Tests:** everything green against the single source of truth (`venue_memberships`).
- **Deploy:** `supabase db push` + app. Only run once Step 7 has been stable in production.

---

## Ordering & risk summary
1–6 are **additive and reversible** (new table, dual-write/read) — ship them at your own pace.
**Step 7 is the cutover** — it changes isolation enforcement; test hardest here.
8–9 unlock the feature and remove the old model.

Rough size: ~2 migrations of real weight (Steps 1 and 7), ~5 app PRs, one dedicated isolation-test
pass. Budget the most review time for Step 7.
