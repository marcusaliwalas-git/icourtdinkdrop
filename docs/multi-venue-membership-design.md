# Design: one person, many venues (many-to-many membership)

Status: **proposal, not built.** This documents what it would take to let a single registered
account belong to (and be a member/admin of) more than one venue — and why it's a deliberate,
non-trivial change to the auth/scoping core.

## The limitation today

- `auth.users.email` is globally unique → one person = one account.
- `profiles.venue_id` is a **single** value, and `profiles.role` is a single value → that account
  belongs to exactly one venue, with one role.
- `memberships` (the paid tier) links to a `profile_id` only, so a membership is implicitly for that
  profile's one venue.

Result: a person can't be a member at Venue A **and** Venue B; signing into another venue's host
makes them a "foreigner" there. Workaround is a separate email per venue.

## The core idea

Separate **identity** (who you are) from **per-venue relationship** (which venues you belong to and
your role at each). Identity stays on `auth.users` / `profiles`; the relationship moves to a join
table.

## Schema changes

```sql
-- One row per (person, venue). Replaces profiles.venue_id + profiles.role for the relationship.
create table venue_memberships (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  venue_id    uuid not null references venues (id)   on delete cascade,
  role        text not null default 'player' check (role in ('player','organizer','admin')),
  created_at  timestamptz not null default now(),
  unique (profile_id, venue_id)
);
create index venue_memberships_profile_idx on venue_memberships (profile_id);
create index venue_memberships_venue_idx   on venue_memberships (venue_id);

-- The paid tier becomes per-venue too, so someone can be a paying member at each venue.
alter table memberships add column venue_id uuid references venues (id);
-- (later) make it not-null once backfilled; index (profile_id, venue_id).
```

`profiles` keeps identity only: `full_name`, `phone`, `skill_level`, `avatar_url`. `venue_id` and
`role` are dropped **after** the transition (keep them during dual-write, see Migration).

## The hard part: RLS must scope to the *request's* venue, not the user's

Today RLS uses `current_user_venue()` = the caller's single `profiles.venue_id`. With many-to-many
there is no single venue — an admin could be admin of several. Policies must instead scope to the
venue of the **current request** (the host being accessed), and check the caller's role *at that
venue*.

Postgres can't see the HTTP host, so the app must hand it the venue per request:

```sql
-- The request's venue, set by the app right after getTenant() (see App changes).
create or replace function request_venue() returns uuid
  language sql stable as $$ select nullif(current_setting('app.current_venue', true), '')::uuid $$;

-- Replaces is_admin()/current_user_venue() in every policy.
create or replace function is_member_of(p_venue uuid) returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (select 1 from venue_memberships
                   where profile_id = auth.uid() and venue_id = p_venue) $$;

create or replace function is_admin_of(p_venue uuid) returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (select 1 from venue_memberships
                   where profile_id = auth.uid() and venue_id = p_venue and role = 'admin') $$;
```

Every tenant-scoped policy is rewritten from
`is_admin() and venue_id = current_user_venue()` to
`is_admin_of(request_venue()) and venue_id = request_venue()`, and reads that were
`... = current_user_venue()` become `... = request_venue()`. Tables affected: `venues`,
`courts`, `operating_hours`, `closures`, `court_rate_periods`, `coaches`, `sessions`,
`bookings`/`booking_slots`, `memberships`, `venue_sections`, `payment_accounts`, `audit_log`,
`profiles` (a profile is now visible to an admin of any venue the profile is a member of).

**Safety invariant:** if `app.current_venue` is unset, `request_venue()` is null and every
tenant-scoped policy denies. So the per-request set is mandatory — a missing set fails closed, not
open.

## App changes

1. **Set the venue context every request.** After `getTenant()` resolves the venue, run
   `select set_config('app.current_venue', <venue.id>, false)` on the request's DB connection
   (wrap it in the server Supabase client / a middleware). This is the new invariant everything
   relies on.
2. **`requireAdmin()`** → check `venue_memberships` for `role = 'admin'` at the resolved tenant
   (instead of `profile.role` + `venue_id` match). `requireSuperAdmin()` is unchanged.
3. **Signup / OAuth callback** → upsert a `venue_memberships` row `(profile_id, tenant.id, 'player')`
   instead of setting `profiles.venue_id`. Idempotent via the unique constraint; never downgrades an
   existing row.
4. **Membership / pricing** → `has_active_membership` becomes venue-scoped
   (`memberships where profile_id = ? and venue_id = ?`); the booking pricing already gates on the
   court's venue (see `create_booking`), so it keys off the membership at *that* venue.
5. **Admin surfaces** (Members list, Top Customers, etc.) → query `venue_memberships` for the
   current venue rather than `profiles.venue_id`.
6. **"Create your venue" / super-admin onboarding** → creating a venue's admin inserts an
   `admin` row in `venue_memberships` for the new venue (a person can now be admin of several).
7. **Account/profile edits** stay on `profiles` (identity) — unaffected.

## Migration / backfill (safe, staged)

1. Create `venue_memberships`; backfill one row per existing profile:
   `insert ... select id, venue_id, role from profiles where venue_id is not null`.
2. Add `memberships.venue_id`; backfill from the member's `profiles.venue_id`.
3. Ship the app changes **dual-reading**: prefer `venue_memberships`, fall back to
   `profiles.venue_id` while both exist.
4. After verifying, flip RLS to `request_venue()`/`is_admin_of()`, drop `profiles.venue_id` and
   `profiles.role`, make `memberships.venue_id` not-null.

Each step is additive until the final flip, so it can roll out without downtime.

## Scope & trade-offs

- **Touches the security core:** every RLS policy, the request lifecycle (the new venue-context
  set), signup/OAuth, admin gating, pricing, and several admin queries. It is the biggest change in
  the multi-tenancy line — worth a dedicated branch, careful review, and an isolation test pass.
- **Enables:** one identity across venues; different roles per venue (player at A, admin at B);
  per-venue paid memberships.
- **New failure mode to guard:** the per-request `app.current_venue` must always be set; the
  fail-closed default above is what keeps a missed set from leaking data.
- **Not needed if** your customers each belong to a single venue — the current single-`venue_id`
  model is simpler and already correct for that. Only build this when real users genuinely span
  multiple venues.

## Smaller alternative

If the only goal is "the same person can *book* at multiple venues" (not be a *member* at each),
that already works today via guest bookings, and a signed-in user can book any venue's courts — they
just won't get member pricing away from home (now enforced). The join-table redesign is only for
*membership/role* across venues.
