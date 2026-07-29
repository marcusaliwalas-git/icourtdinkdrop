# Decisions

Running log of choices made that weren't explicitly specified in `PRD.md`, per its section 0.

## Bugs found and fixed during Phase 1 verification (2026-07-29)

Live-testing every flow in the browser (not just `npm test`) surfaced four real bugs the
DB-level test suite couldn't see, since those tests connect as the Postgres superuser and
bypass RLS/grants entirely:

- **New tables weren't exposed to the API roles.** Newer Supabase Postgres images default to
  *not* auto-granting `anon`/`authenticated`/`service_role` access to new tables (only
  `TRUNCATE`/`REFERENCES`/`TRIGGER`/`MAINTAIN`, no `SELECT`/`INSERT`/`UPDATE`/`DELETE`). Every
  request against a custom table failed with `permission denied` until an explicit `GRANT`
  migration was added, plus an `ALTER DEFAULT PRIVILEGES` so future tables don't repeat this.
- **`bookings` and `booking_players` RLS policies caused infinite recursion.** Each table's
  SELECT policy checked a condition on the *other* table via a direct subquery (is this booking
  mine? / does this booking have me as a named player?), so evaluating one policy re-entered the
  other, forever. Fixed by routing each cross-table check through a small SECURITY DEFINER
  function — those run as the table owner (a local superuser), which bypasses RLS on the table
  they query, breaking the cycle. This was invisible to `npm test` because those tests never
  exercise the policies as `anon`/`authenticated` — only the live admin calendar surfaced it.
- **The role-escalation guard blocked the seed script, not just end users.** The trigger that
  stops a non-admin from setting their own `role` checked `is_admin()`, which resolves via
  `auth.uid()` — always null for a service-role connection. It silently reverted every seeded
  admin/organizer back to `player`. Fixed by only enforcing the guard when `auth.role() =
  'authenticated'`, since a service-role connection already bypasses RLS entirely by design.
- **Magic-link sign-in redirected to the wrong place, twice over.** First, `additional_redirect_urls`
  in `supabase/config.toml` only allow-listed the bare origin, so Supabase silently dropped the
  app's custom `/auth/confirm` redirect path and fell back to the site's root — losing the auth
  code. Second, once that was fixed, `/auth/confirm` only handled the older `token_hash`-based
  OTP shape; the `@supabase/ssr` browser client defaults to the PKCE flow, so the actual landing
  URL carries a `?code=` param that needs `exchangeCodeForSession`, not `verifyOtp`. Fixed the
  redirect allow-list (wildcarded per-origin) and made `/auth/confirm` handle both shapes.

## Confirmed with you before building (2026-07-29)

- **One venue**, owned (not aggregating third-party venues).
- **Pay-at-venue only** for Phase 1 — no payment provider integration yet.
- **Mixed access**: public can book courts; some future sessions/rates may be members-only.
- **English-only** UI copy for Phase 1.
- **Local Supabase** (CLI + Docker) for development; hosted project comes later.
- **Proposed visual direction** (no existing brand assets) — see "Visual direction" below.
- **Phone OTP deferred** out of Phase 1 — magic link + Google only. Reason: needs a paid SMS/Twilio provider wired up behind Supabase Auth, which is a separate cost/config decision from the rest of Phase 1.
- **No 10-minute booking hold** in Phase 1 — bookings go straight to `confirmed` since there's no payment to wait on. Holds return in Phase 2 once real payment exists.

## Made independently while building

- **Next.js pinned to 15.x**, not the 16.x that `create-next-app@latest` installs by default. The spec says "Next.js 15+"; pinning to 15 avoids exposure to Next 16's breaking changes that aren't in this build's working knowledge.
- **Full table set created in Phase 1's migrations**, including tables only used by Phase 2-4 (`sessions`, `session_signups`, `waitlist`, `credits`, `credit_ledger`, `notifications`). RLS is enabled on all of them with an admin-only escape-hatch policy; no player-facing policies are added until the phase that needs them. This avoids painful additive migrations later, at the cost of a few inert tables now.
- **`closures` got an explicit `venue_id` column** in addition to the spec's nullable `court_id`. A whole-venue closure (`court_id is null`) still needs to know *which* venue — with only one venue today it's not load-bearing, but it removes an ambiguity the spec didn't resolve.
- **Guest checkout fields added directly on `bookings`** (`guest_name`, `guest_phone`), enforced via a check constraint (`booked_by is not null OR both guest fields are set`). The spec's data model didn't say where guest identity lives for the *primary* booker (as opposed to `booking_players`, which is for additional named players in the party).
- **`bookings.reference_code`**: an 8-character code generated on insert, shown on the confirmation screen (spec 4.3's "QR code / booking reference") and doubles as the bearer credential for guest self-service cancellation, since guests have no session to check `booked_by` against.
- **All booking writes go through two SECURITY DEFINER Postgres functions**, `create_booking` and `cancel_booking`, never direct table inserts/updates from the client — even for admins. This keeps the exclusion-constraint conflict path, price computation, and rules-engine checks in exactly one place. `bookings`/`booking_players`/`audit_log` therefore have no client-facing RLS write policies beyond an admin escape hatch (kept for direct dashboard/SQL access, not used by the app itself).
- **Rules engine scoped down for Phase 1**: only minimum lead time and max advance-booking window are enforced (both on `venues`, admin-editable later). Peak/off-peak pricing, per-member weekly hour caps, and configurable booking durations/increments are deferred — Phase 1 hardcodes 30-minute increments (30/60/90/120+ min in multiples of 30).
- **Cancellation policy simplified for Phase 1**: any confirmed/pending booking can be cancelled up until its start time; no refund tiers (nothing's been paid online yet, so there's nothing to refund). The venue's `cancellation_cutoff_hours` column exists in the schema for Phase 2 but isn't enforced yet.
- **Member vs. guest rate**: `courts.member_rate_cents` (nullable, falls back to `hourly_rate_cents`). Computed server-side in `create_booking` from the booker's active-membership status — never trusts a client-supplied price.
- **"Add players by name" (spec 4.3) shipped in Phase 1** as a plain list of names attached to `booking_players`; invite-via-link is deferred since it implies its own auth/notification flow.

## Visual direction (no brand assets given)

Proposing a clean, mobile-first look using shadcn/ui's neutral defaults with a single accent color, easy to re-skin once real brand assets exist. Will confirm the specific palette when the first UI slice is demoed.
