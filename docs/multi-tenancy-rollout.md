# Multi-tenancy production rollout runbook

Turning the live single-tenant deployment into a pooled multi-tenant one: one Supabase database,
one Vercel deployment, many venues (tenants) resolved by hostname.

**Linked Supabase project:** `prymtkfhkhrnxpinlkww`
**Existing production host(s):** `www.icourt.dinkdrop.live` (and `icourt.dinkdrop.live`)

> **The one ordering rule that matters:** while the database holds **exactly one** venue, the app
> serves it for *every* host (the single-venue fallback in `getTenant()`). The moment a **second**
> venue exists, hostname matching becomes mandatory — so you **must pin the existing venue to its
> host (Step 3) before creating tenant #2 (Step 6)**, or the current site resolves to "no tenant".

---

## 0. Prerequisites

- [ ] The multi-tenancy code is **merged and deployed** to production (Vercel).
      On origin, PR #11 is stacked on the booking PR (#10) — merge #10 first, then #11.
- [ ] You have the linked project's **service-role key** and **DB password** (Supabase dashboard →
      Project Settings → API / Database).
- [ ] Vercel env var `SUPABASE_SERVICE_ROLE_KEY` is set in Production (used by the OAuth callback to
      assign a first-time Google user's venue).
- [ ] Decide the **root domain** for subdomain tenants (e.g. `dinkdrop.live` → `acme.dinkdrop.live`).

## 1. Back up first

Migrations here are additive (new columns/policies + a backfill), but always snapshot before a
production schema change:

- Supabase dashboard → **Database → Backups → Create backup** (or `pg_dump` the linked DB).

## 2. Apply the migrations

```bash
# from the repo root, on the branch that contains the multi-tenancy migrations
supabase migration list          # confirm the 3 pending: 20260827000000 / 20260827120000 / 20260827130000
supabase db push                 # applies them to the linked production database
supabase migration list          # confirm all now show a remote timestamp
```

What they do:
- `20260827000000_multitenancy_foundation` — `venues.slug` + `custom_domain`, `profiles.venue_id`
  (existing rows backfilled to the single venue, slug set to `default`), `current_user_venue()`.
- `20260827120000_multitenancy_rls` — scopes every private table + admin write to the caller's venue.
- `20260827130000_multitenancy_rpc_guards` — venue checks inside the admin booking RPCs.

Quick sanity (Supabase SQL editor):

```sql
select name, slug, custom_domain from venues;                 -- one row, slug = 'default'
select count(*) filter (where venue_id is null) as unassigned from profiles;  -- expect 0
```

## 3. Pin the existing venue to its host  ⚠️ do this BEFORE Step 6

Give the current production venue a stable identity so it keeps resolving once a second tenant
exists. Pick the **canonical** prod host and make the other variant redirect to it in Vercel.

```sql
-- Example: canonical host is www.icourt.dinkdrop.live
update venues
   set slug = 'icourt',
       custom_domain = 'www.icourt.dinkdrop.live'
 where slug = 'default';
```

- `getTenant()` checks `custom_domain` first, then a subdomain `slug` under the root domain. Setting
  both covers `www.icourt.dinkdrop.live` (custom_domain) **and** `icourt.dinkdrop.live` (slug
  `icourt`, if your root domain is `dinkdrop.live`).
- Ensure Vercel redirects the non-canonical variant (e.g. `icourt.dinkdrop.live` → `www.icourt…`) so
  there's one canonical host.

## 4. Configure the deployment for tenants

**Vercel → Project → Settings → Environment Variables (Production):**

```
NEXT_PUBLIC_ROOT_DOMAIN = dinkdrop.live      # subdomain tenants become <slug>.dinkdrop.live
```

Redeploy so the new env var takes effect.

**Vercel → Project → Domains:**
- Add the **wildcard** `*.dinkdrop.live` (this routes every `<slug>.dinkdrop.live` to this one
  deployment).
- Keep the existing prod domain(s) attached — unchanged.
- For each future **custom-domain** tenant, add their domain here too (e.g. `acmepickleball.com`).

**DNS (at your DNS provider for `dinkdrop.live`):**
- `*.dinkdrop.live` → `CNAME cname.vercel-dns.com` (or the A/ALIAS target Vercel shows).

**Supabase → Authentication → URL Configuration → Redirect URLs** (so magic-link / OAuth / reset
land on the right tenant host):

```
https://*.dinkdrop.live/**
https://www.icourt.dinkdrop.live/**
# …plus each custom domain you add, e.g. https://acmepickleball.com/**
```

## 5. Verify the existing site still works

Before adding any tenant, confirm the current site is unaffected:
- Visit `https://www.icourt.dinkdrop.live` → loads normally.
- Sign in as an existing admin → `/admin` shows the same (default) venue's data.

## 6. Create the first real tenant

Run the onboarding script **against production**. Put the prod URL + service-role key in a local,
**git-ignored** env file (never commit it):

```bash
# .env.prod  (DO NOT COMMIT)
# NEXT_PUBLIC_SUPABASE_URL=https://prymtkfhkhrnxpinlkww.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=<prod service-role key>

npx tsx --env-file=.env.prod supabase/create-tenant.ts \
  --name "Acme Pickleball" \
  --slug acme \
  --admin-email owner@acme.com \
  --admin-password '<a strong password>' \
  --timezone Asia/Manila
  # add --domain acmepickleball.com for a custom-domain tenant
```

This creates: the venue (with `slug`/`custom_domain`), full-week 06:00–22:00 hours, a starter
"Court 1", and the venue's first admin (pinned to the venue). It prints the hostname to point.

Then:
- **Subdomain tenant:** `acme.dinkdrop.live` already works (wildcard). Give the owner that URL.
- **Custom-domain tenant:** add `acmepickleball.com` in Vercel Domains and have the tenant CNAME it
  to Vercel; `create-tenant.ts --domain` already set `venues.custom_domain`.

## 7. Smoke-test isolation

- On the new tenant's host: sign in as `owner@acme.com` → `/admin` shows **only Acme's** courts,
  coaches, bookings, members. The venue/courts/coaches pages are Acme's.
- On the existing prod host: still shows **only the default venue's** data.
- Make a test booking on each host; confirm neither appears on the other.
- (Optional) Confirm an Acme admin can't act on a default-venue booking: any admin action is
  venue-scoped by RLS and the RPC guards.

## Rollback

- **Code:** revert the deploy. With the multi-tenancy code gone, `getTenant` isn't used and the app
  behaves single-tenant again; the extra columns/policies are harmless if left in place.
- **RLS only** (if isolation misbehaves but you want to keep the code): re-apply the pre-multitenancy
  policies via a down migration (ask and I'll generate one that restores the global-admin policies).
- The additive columns (`venues.slug`, `venues.custom_domain`, `profiles.venue_id`) can safely stay.

## Notes & gotchas

- **Shared auth:** one Supabase project = one auth system, so an **email exists only once** across
  all tenants. This matches the "accounts isolated per tenant" model; the same person can't hold two
  accounts under one email. A signup with an already-used email is rejected by Auth.
- **Service-role key** is used server-side only (OAuth callback + `create-tenant.ts`). Never expose
  it to the browser or commit it.
- **First admin login:** `create-tenant.ts` sets the admin's password directly and confirms the
  email, so they can sign in immediately at their tenant host.
- **Storage** (payment slips, coach photos) is shared across tenants but keyed by random UUID paths;
  slips are a private bucket (admin-only via signed URLs), photos are public images.
