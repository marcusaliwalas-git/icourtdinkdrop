# Decisions

Running log of choices made that weren't explicitly specified in `PRD.md`, per its section 0.

## Reversed the midnight-crossing exception — bookings now capped to same-day closing time (2026-07-30)

Earlier, `create_booking` deliberately skipped the operating-hours check for any booking whose
duration crossed local midnight, reasoning that a long (up to 24h) booking needing to span
closing time was legitimate and the admin's pending-review step was enough of a safety net.
On reflection (prompted by a direct question about whether a 10pm-close venue should let
someone pick more hours than fit before close) that reasoning didn't hold up: a venue's
operating hours are a real-world constraint — no one's there to let a player in overnight —
so silently allowing a booking to run past them was a bug, not a feature, regardless of the
pending-approval safety net.

Reversed it: every booking must now fit entirely within the operating hours of the day it
starts on, with no exception. Implemented by computing the booking's end time as
minutes-from-local-midnight-of-the-start-day *without* wrapping at 24h (so a booking that
would spill into the next calendar day produces an end-minutes value no `close_time` can
ever satisfy, and is rejected the same way a same-day overflow is) rather than the previous
separate "crosses midnight" branch. A round-the-clock venue (open_time 00:00, close_time
24:00) would still support a genuine 24-hour booking under this rule — it's the same-day
constraint that's now absolute, not the duration cap itself.

## Hourly-only calendar rows, anchored to admin-configured hours (2026-07-30)

Both grids (`/book` and `/admin/calendar`) showed 30-minute rows, left over from before booking
durations moved to whole-hour increments. Changed `slotMinutes` from 30 to 60 in both
`buildAvailabilityGrid` and `buildAdminCalendarGrid` call sites — no other logic changes were
needed, since that loop already started at the venue's configured `open_time` and stepped by
`slotMinutes`. That's also what "depends on the admin setup" means here: rows anchor to
whatever `open_time` the admin sets (e.g. an open_time of 06:30 produces rows at 6:30, 7:30,
8:30..., not rounded to the clock hour) rather than a fixed grid — added a unit test
(`tests/unit/availability.test.ts`) asserting exactly that, since these pure functions had no
direct test coverage before. Didn't add a DB-level check that `create_booking`'s start time is
hour-aligned relative to `open_time` — the grid is the only path that constructs start times in
the app today, so the UI already enforces it end-to-end; flagged as a gap if the RPC is ever
called directly from outside the app.

## Optional guest email (2026-07-30)

Guest checkout only ever collected name + phone (spec 4.1's minimal "no account" flow), so
guests never got the pending/confirmed booking emails — only members with an account did.
Added an **optional** `guest_email` column and form field rather than making email required:
a guest who provides one now gets the same pending/confirmed/cancelled emails as a member;
a guest who leaves it blank still gets the reference code + WhatsApp share link as before.
Chose optional over required specifically to not add friction to the spec's "book in under
60 seconds" mobile guest flow. `create_booking`'s signature changed (added `p_guest_email`),
which required an explicit `drop function` before `create or replace` — Postgres only
replaces on an exact argument-type match, so adding a parameter without dropping the old
signature first would have left two ambiguous overloads coexisting.

## Local-dev SMTP fallback for booking emails (2026-07-30)

The submitted/confirmed booking emails (`sendBookingPendingEmail`, `sendBookingConfirmationEmail`)
were already wired into `createBooking` and `adminConfirmBooking`, but were unverifiable in local
dev — Resend needs a real API key, and without one `safeSend` just logged a warning and skipped.
Added a dev-only fallback: when `RESEND_API_KEY` isn't set, `safeSend` now routes through
`LOCAL_SMTP_URL` (nodemailer → the local Supabase Mailpit SMTP port) instead of just skipping, so
booking emails are actually visible in the Mailpit inbox at http://127.0.0.1:54324. Needed
uncommenting `smtp_port = 54325` in `supabase/config.toml` (off by default) so Mailpit's SMTP
port is reachable from the host, not just its web UI. Production is unaffected — `RESEND_API_KEY`
takes priority whenever it's set, and `LOCAL_SMTP_URL` should never be set outside local dev.

## Pending-approval bookings + hourly durations (2026-07-30)

Two requested changes to the booking flow:

- **Online bookings now start `pending`, not `confirmed`.** `create_booking` picks the initial
  status from `source`: `online` → `pending`, `walkin`/`admin` → `confirmed`. Walk-ins stay
  auto-confirmed since staff are already handling those in person at the counter — there's no
  one else to "confirm" it. A new admin-only `confirm_booking` function moves a pending
  booking to `confirmed`; the admin calendar's booked cells now open an action sheet (rather
  than cancelling on click) that shows **Confirm booking** for pending bookings, or
  **Mark as no-show** for started confirmed ones, plus **Cancel** either way. Pending
  bookings render in a distinct yellow tint with a "(pending)" label so admins can spot
  them at a glance. Guests/members can still cancel a pending booking themselves, same as a
  confirmed one; a pending booking that's never confirmed doesn't get a "no-show" concept
  (that only applies once the venue expected it to happen).
- **Booking confirmation emails split into two.** `sendBookingPendingEmail` goes out
  immediately ("we got your request, awaiting confirmation"); the existing
  `sendBookingConfirmationEmail` is now sent when an admin confirms it (from
  `adminConfirmBooking`, using the service-role admin client to look up the member's email
  since a normal admin session can't read `auth.users`).
- **Duration selection moved from 30-minute increments (30 min-4 hr) to whole-hour
  increments, 1-24 hours.** Both `createBookingSchema` and `create_booking` itself enforce
  `% 60 = 0` and `<= 1440` (the RPC is callable directly, not just through the Next.js action,
  so the DB has to enforce this too, not just the Zod schema).
- **24-hour bookings routinely cross midnight in venue-local time**, which the old "must fit
  inside one day's `operating_hours` row" check always rejected. Rather than build multi-day
  operating-hours logic, `create_booking` now skips that containment check specifically when
  the booking's local end-of-day wraps past its local start (i.e. spans more than one calendar
  day) — closures and the exclusion constraint still apply regardless, and since it's an
  online booking it stays `pending` until an admin reviews it anyway, which doubles as the
  sanity check for these edge cases. A same-day booking that simply falls outside operating
  hours (no wrap) is still rejected as before.

## Remaining admin capability from spec 4.10/4.5 (2026-07-30)

Filled out the rest of the admin dashboard section that fit Phase 1's data model without
pulling in Phase 2 (payments/credits) or Phase 4 (reports/heatmaps, automatic no-show
enforcement) scope:

- **Member directory** (`/admin/members`) — search by name/phone, each member's booking
  history, no-show count, membership status. No credit balance/manual credit adjustments
  shown, since there's no payment data yet (Phase 2).
- **Mark a booking as no-show** — added a `mark_no_show` SECURITY DEFINER function (only for
  confirmed bookings that have already started), which increments the booker's
  `no_show_count`. The admin calendar's booked cells now open an action sheet (Cancel /
  Mark no-show) instead of cancelling immediately on click — a small correctness fix, since a
  single misclick used to cancel a real booking with no confirmation step.
- **Manual booking restriction** — an admin can set `profiles.booking_restricted_until` from
  the member detail page, and `create_booking` now rejects new bookings for a restricted
  member. This is deliberately the *manual* half of spec 4.5's "N no-shows in a rolling window
  restricts booking privileges" — the automatic rolling-window trigger is still Phase 4;
  here the admin decides if/when to apply or lift a restriction.
- **Audit log viewer** (`/admin/audit`) — filterable by entity, since the log itself already
  existed (bookings, venue/court/closure edits, and now no-show/restriction actions all write
  to it).
- **CSV export** — `/admin/members/export` and `/admin/bookings/export` (optional
  `from`/`to` date range), linked from the members page and the admin calendar toolbar.

**Bug found while verifying this**: `audit_log` had a SELECT policy for admins but no INSERT
policy. Every admin action logged via the client's own session (venue/court/closure edits,
the new no-show/restriction actions) was silently failing to write its entry — only booking
events survived, because those are logged inside SECURITY DEFINER functions that bypass RLS
as the table owner. Fixed with an admin-only INSERT policy; audit_log stays append-only
(no UPDATE/DELETE policy for anyone).

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
