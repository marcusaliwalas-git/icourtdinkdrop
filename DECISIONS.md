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

## Landing page (2026-07-30)

- **`/` replaced its `redirect("/book")` stub with a real marketing/info home page.** Previously every visitor was bounced straight to the booking grid with no context on the venue, hours, or pricing first.
- **Signature element is a live per-court status board**, not a decorative stat block. `computeLiveStatus` (`src/lib/home-status.ts`) derives OPEN NOW / IN USE / CLOSED per court from the same `operating_hours` + `booking_slots` data the booking grid uses, so the home page answers "is there a court free right now" directly rather than with marketing copy. Covered by `tests/unit/home-status.test.ts`.
- **Distinct palette scoped locally to the page**, not merged into the shared shadcn theme tokens in `globals.css` — deliberately, so `/book`, `/admin`, `/account`, and `/login` are untouched. Uses Tailwind arbitrary-value hex classes tied to pickleball's real materials: `#0E2A2E`/`#14383C` (court-paint teal), `#E7F229` (optic-yellow ball accent, used sparingly), `#F3F6F0`/`#8FB3AC` for text.
- **Space Grotesk added as a display face** (`src/app/layout.tsx`, `--font-display`) for the home page's headlines only; everything else keeps Geist. Loaded globally via `next/font/google` since font loading is a root-layout concern, but only referenced from `page.tsx`.
- **Standard nav bar hidden on `/` only** (`src/components/site-header.tsx`) since the home page has its own hero-integrated top bar with a single "My bookings" link.
- **No numbered-step badges for "How it works.**" It's a genuine 3-step sequence (pick a time → send request → pay at venue), but an inline arrow flow reads faster than three numbered cards for something this short.
- **Entire page is a server component** — no `"use client"`, no interactivity beyond plain `<Link>` navigation. The status board's entrance animation is pure CSS (`@keyframes board-row-in` in `globals.css`, gated behind `motion-safe:`), so there's no client JS cost for a one-time load animation.

## Site-wide theme rollout (2026-07-30)

- **The home page's palette became the app's only theme**, not a one-off scoped to `/`. Every other page (`/book`, `/login`, `/account`, `/bookings`, all of `/admin/*`) was already built entirely on shadcn's semantic tokens (`bg-background`, `bg-card`, `text-muted-foreground`, `Button`/`Card`/`Input`, etc.) with zero hardcoded colors outside `page.tsx` — confirmed by grepping for raw Tailwind color utilities and hex/rgb values across `src/app` and `src/components`. That meant the fastest, most consistent way to reskin the whole site was to push the brand palette into the shared `.dark` token block in `globals.css` and force dark mode globally (`className="dark"` on `<html>` in `layout.tsx`), rather than copy hero-page markup onto every route.
- **`page.tsx` itself was refactored off its local arbitrary-hex classes** (`bg-[#0E2A2E]`, `text-[#8FB3AC]`, etc.) onto the same semantic tokens, so the home page now participates in the one shared theme instead of hardcoding values that happen to match it.
- **`--font-heading` now points at `--font-display` (Space Grotesk)** instead of `--font-sans`. Since shadcn's `Card`/`Sheet`/`Dialog` titles already used the `font-heading` utility class site-wide, this alone re-typeset every card/sheet/dialog heading across booking, admin, and auth flows. A `@layer base` rule (`h1, h2, h3 { font-family: var(--font-heading) }`) extends the same treatment to plain heading tags (page titles like "My bookings", "My account") that don't go through those components.
- **Functional status colors were left alone.** The amber/emerald "closed/available" cell colors in the availability grid and admin calendar already had `dark:` variants from when the app was neutral-gray dark mode; enabling `.dark` globally activated those variants as-is. Deliberately not reskinned to the brand yellow-green, since available/closed is a UX convention (green/amber), not a branding opportunity — recoloring it would trade clarity for consistency.
- **No component shapes were changed** (border radius, button sizing) — only color tokens and heading typography. The homepage's pill-shaped hero CTAs are a one-off treatment for its two big buttons, not a new site-wide button style.

## Multi-tile booking selection (2026-07-30)

- **Replaced the "click one slot, then pick a duration dropdown" flow with direct multi-tile selection** in [availability-grid.tsx](src/app/book/availability-grid.tsx), validated with an interactive HTML mockup first. Tapping an open tile starts a one-hour selection for that court; tapping the next tile down extends it; tapping the current start/end tile again shrinks it. A fixed bottom bar shows the court, time range, and duration, with Clear/Continue actions — Continue opens `BookingSheet` pre-filled with the exact range, so the sheet no longer has a duration control at all, just party size and guest fields.
- **Selection is constrained to one court and always contiguous by construction** — extension only accepts the row immediately adjacent to the current start/end, and only if that row's status is `available`. This automatically caps duration at the same-day closing time and around existing bookings/closures, since `rows` (from `buildAvailabilityGrid`) already stops at close and marks conflicting rows non-available; no separate max-duration logic was needed.
- **Grid rows are hourly, not 30-minute**, matching the earlier "calendar should only show hours" decision — `slotMinutes: 60` in `book/page.tsx` was already in place, so this change didn't need to touch row generation, only the click/selection model built on top of it.
- **A `useEffect` re-validates the current selection whenever `rows` changes** (e.g. after the realtime `booking_slots` subscription triggers `router.refresh()`) and clears it if any selected tile is no longer available — otherwise a user could submit a stale range that raced with someone else's booking.
- **`lib/booking-durations.ts` (the `DURATION_HOURS` dropdown list) was left in place** — the admin walk-in sheet (`admin/calendar/walk-in-sheet.tsx`) still uses it for staff-created bookings, which keep the dropdown since staff aren't looking at a live grid the same way.

## Nav + auth changes (2026-07-30)

- **Added a "Home" link before "Book" in `site-header.tsx`** — the shared nav (shown on every page except `/` and `/admin/*`) previously had no way back to the landing page short of the browser back button.
- **Replaced magic-link email sign-in with email/password sign-in + sign-up**, kept Google OAuth as-is. Confirmed with you first since this had a real consequence: your admin account (`johnmarcusaliwalas@gmail.com`) was created via magic link and had no password. Chose "sign in + sign up" (not sign-up-only) plus a password-reset flow, specifically so that account isn't locked out — added `/reset-password` and wired `/auth/confirm` to redirect there when the incoming link is `type=recovery`, reusing the same PKCE `code`-exchange route magic link used (that route already handled both the `code` and `token_hash` shapes, so no change was needed there beyond the `next` redirect target).
- **`login/page.tsx` is a single component with a `mode: "signin" | "signup"` toggle**, not two routes — same card, same Google button, same guest-checkout link; only the form body and submit label change. `enable_confirmations = false` in `supabase/config.toml` means `signUp()` returns an active session immediately (no separate "check your email" step), matching the sign-in flow's immediacy.
- **No new validation library** — password length is enforced by the `minLength={6}` input attribute plus Supabase's own `minimum_password_length = 6` server-side check; "passwords don't match" is a plain client-side string comparison. Didn't add this to `lib/validation/` since it's UI-only state, not data crossing into a server action.

## Time-based (peak/off-peak) court pricing (2026-07-30)

- **New `court_rate_periods` table** (migration `20260730070343_court_rate_periods.sql`): `court_id, start_time, end_time, hourly_rate_cents, member_rate_cents`. A court with no rows just keeps charging its flat `hourly_rate_cents`/`member_rate_cents` for every hour — periods are optional overrides for specific windows, not a replacement, so no data migration was needed for existing courts.
- **`create_booking` now prices each hour of a booking individually** against the court's rate periods, summing per-hour instead of `rate * duration`. Since duration is already constrained to whole hours, this is an exact integer-cent sum — no fractional-hour rounding to reason about. Overlapping periods (a data-entry mistake, not a supported setup) resolve to whichever starts latest.
- **`lib/pricing.ts` mirrors that same per-hour logic in TypeScript** (`rateForHour`, `computeBookingTotalCents`, `allRatesCents`), covered by `tests/unit/pricing.test.ts`. This is what `booking-sheet.tsx` uses to show the "Estimated total" before submitting — it has to match the Postgres function's math exactly, or the estimate would lie about what gets charged. Verified live: a Court 1 booking spanning the 2pm boundary (1–3pm at ₱400/₱500) showed "₱900.00" in the sheet and the row that landed in the database also had `total_cents: 90000`.
- **Admin UI**: `admin/venue/rate-periods-manager.tsx`, nested inside each court's edit dialog in `courts-manager.tsx` (only shown for existing courts, since a new court has no id to attach periods to yet). Mirrors the existing `HoursManager` list-plus-inline-add-form pattern for consistency.
- **Found and fixed a real bug while wiring this up**: the rate-periods `<form>` was nested inside the court-edit `<form>`, which is invalid HTML (`<form>` can't contain a `<form>`) and threw a hydration error. Fixed by moving `CourtForm`'s return to a wrapping `<div>` with the court form and `RatePeriodsManager` as siblings, not parent/child.
- **Home page pricing range** (`page.tsx`) now uses `allRatesCents` across every court's base rate plus its periods, so "₱X–₱Y/hr" reflects the true range instead of just the flat base rate, plus a "Rates vary by time of day" note when any court has periods configured.
- **Debugging note for future sessions**: the `read_console_messages` browser tool appeared to replay stale/historical console errors across page reloads and even a dev-server restart in this session — a genuine fix looked identical to the bug for several checks. `preview_logs` (the dev server's own stdout) and a visual screenshot were the reliable ground truth; trust those over the console-message buffer when they disagree.

## Editable hours + midnight closing times (2026-07-30)

- **Made `operating_hours` rows fully editable in place** (`hours-manager.tsx`): each row is now its own small form (day/open/close + Save/Remove) instead of plain text, backed by a new `updateOperatingHours` server action. Previously the only way to change a day's hours was delete-and-re-add.
- **Admins can now set a close time of midnight**, which turned out to need a real fix, not just a UI tweak: `operating_hours_check` requires `close_time > open_time`, so a literal `close_time = '00:00'` is always rejected — but Postgres's `time` type does accept `'24:00:00'` as a valid end-of-day value, and it satisfies the check (verified directly against the DB before touching any code). The catch is that a native `<input type="time">` can't hold "24:00" at all — the HTML spec caps it at 23:59 — so there was no way for an admin to enter it even though the database could store it.
- **Fixed by treating "00:00" as shorthand for "24:00"** in `operatingHoursSchema`'s `closeTime` (a zod `.transform`), since a real close time of 00:00 is otherwise a value nothing else needs — an admin picking 12:00 AM in the Close field only ever means "open until the end of the day." Symmetrically, `hours-manager.tsx` converts a stored `24:00` back to `00:00` when populating the input's `defaultValue`, so the round-trip through the native time picker works in both directions. Added a one-line hint above the Hours table since this isn't obvious from the UI alone.
- **No changes needed in `buildAvailabilityGrid` or `create_booking`** — both already worked in whole minutes-since-midnight terms (`extract(hour from close_time) * 60 + ...`), and `time '24:00:00'` extracts to `1440`, which is exactly what "the day has 1440 minutes" arithmetic expects. Verified live end-to-end: set Tuesday's close to 12:00 AM, confirmed it stored as `24:00:00` (not `00:00:00`), confirmed the availability grid showed an 11:00 PM row as bookable, and completed a real booking — the database recorded `time_range` correctly spanning 11pm into the next calendar day at midnight, at the right rate for that hour (outside both of Court 1's rate-period windows, correctly falling back to its base rate). Reverted Tuesday's hours back afterward since it was only a test.

## Date-picker off-by-one bug (2026-07-30)

- **`date-picker-popover.tsx` was reading a calendar selection through the wrong timezone lens**: `react-day-picker` hands back a `Date` at local midnight of the clicked day, but the code read it via `selected.toISOString().slice(0, 10)` — `toISOString()` converts to UTC first, which rolls local midnight back to the *previous* calendar day in any timezone ahead of UTC (the venue's own `Asia/Manila`, UTC+8, included). Clicking August 2 landed on `date=2026-08-01`.
- **Fixed by reading the `Date`'s own local Y/M/D getters** (`getFullYear`/`getMonth`/`getDate`) instead of round-tripping through UTC — there's no timezone conversion to get wrong when you never leave the browser's local time in the first place. Verified live with the browser set to `Asia/Manila`: clicking "2" in the August 2026 grid now correctly lands on `/book?date=2026-08-02` ("Sunday, August 2").
- **The same `.toISOString().slice(0, 10)` pattern elsewhere in the codebase was checked and is safe** (`book/page.tsx`'s `addDays`/`nextSaturday`, `admin/calendar/page.tsx`'s `addDays`, and the CSV export filenames) — those all parse with an explicit `T12:00:00Z` suffix and manipulate via `setUTCDate`, so they stay in UTC end-to-end and never reinterpret a local-time `Date` as UTC the way the date picker did.

## Walk-ins bypass the min-lead-time rule (2026-07-30)

- **`create_booking`'s `LEAD_TIME_TOO_SHORT` check now only applies when `p_source <> 'walkin'`.** The rule exists to stop an online guest from booking a slot starting in the next few minutes; it doesn't make sense when an admin is standing at the venue booking the walk-in customer who's already there for the court they're about to play on. `createWalkInBooking` (`admin/calendar/actions.ts`) is the only caller that ever passes `p_source: "walkin"`, and it's already gated behind `requireAdmin()`, so this can't be reached by a guest or member through the public flow.
- **Every other check still applies to walk-ins** — `OUTSIDE_BOOKING_WINDOW`, `OUTSIDE_OPERATING_HOURS`, `COURT_CLOSED`, exclusion-constraint conflicts, all unchanged. Only the lead-time rule was scoped out, since it's the only one whose entire premise (the booker isn't at the venue yet) doesn't hold for a walk-in.
- Verified live: with the venue's `min_lead_minutes` at 30, booked a walk-in for a slot ~15 minutes out — succeeded and came back `status: confirmed`. Then tried the same near-term slot through the regular `/book` flow (`source: "online"`) and got the same `"This slot starts too soon"` rejection as before, confirming the bypass didn't leak into the public path.

## Manual payment verification instead of a payment gateway (2026-07-30)

- **Chose to skip PayMongo/online-payment-gateway integration entirely** in favor of a much smaller change: guests/members attach a transfer reference number + a photo/PDF of their GCash/bank receipt when booking, and the admin reviews it before clicking the "Confirm booking" button that already existed. No new booking status, no webhook, no third-party account needed — this reuses the exact `pending → confirmed` mechanism the app already had; the only gap was that admin previously had *nothing* to check before confirming.
- **New `payment_reference`/`payment_slip_path` columns on `bookings`**, plus a private Storage bucket (`payment-slips`, 5MB limit, images + PDF only). The bucket has an INSERT policy for `anon`/`authenticated` (guests have no session, so uploading has to work without one) but **no SELECT policy at all** — a signed URL can only ever be minted server-side with the service-role client (`getBookingPaymentProof` in `admin/calendar/actions.ts`), so a slip can never be read via the anon key, guessed, or enumerated, even by another logged-in guest.
- **`create_booking` now raises `PAYMENT_PROOF_REQUIRED`** when `p_source = 'online'` and either field is missing — mirrors the existing `GUEST_INFO_REQUIRED` check right above it. Walk-ins are unaffected (still `pay_at_venue`, still auto-`confirmed`, no proof needed) since only `online` bookings ever require it.
- **`confirm_booking` now also sets `payment_status = 'paid_online'`** in the same transaction as `status = 'confirmed'`. This is safe unconditionally (not just when proof happens to be present) because a `pending` booking is now *only* ever reachable through the online path with proof already attached — walk-ins never go `pending` in the first place. Widened the `payment_status` check constraint to add `awaiting_verification` (set at creation) alongside the existing `paid_online`.
- **Ran into the project's known `create_booking` overload-ambiguity pitfall again**: adding the two new trailing parameters via `create or replace function` left the *old* 12-parameter version in place as a second overload, and every existing named-parameter call site (including the whole `tests/db/booking-rules.test.ts` suite) started failing with `"is not unique"` since Postgres couldn't tell which overload a call without the new params meant. Fixed by adding an explicit `drop function if exists create_booking(uuid, timestamptz, integer, integer, uuid, text, text, text, text, text, text, text[])` before the redefinition — and had to apply that drop directly against the already-migrated local DB too, since editing an already-applied migration file doesn't get replayed.
- **Updated `tests/support/booking.ts`'s `callCreateBooking` test helper** to default a fixture reference/slip path whenever the effective source is `'online'` (overridable to `null` to test the rule itself), rather than touching every one of the ~20 existing test cases that aren't actually testing payment proof. Added three new dedicated tests (`PAYMENT_PROOF_REQUIRED` on missing reference+slip, missing just one of them, and the walk-in bypass) plus a `payment_status` assertion on `confirm_booking`.
- **Booking-sheet UI**: the guest/member form always shows a payment reference field + file input (not gated by login state, since the requirement is about the booking's source, not who's booking) right after the computed total, with copy telling them to transfer that exact amount first. The upload happens client-side straight to Storage (browser anon client) before `createBooking` runs, so the booking is only ever created with a slip path that's already confirmed to exist.
- **Email copy updated** to drop "pay at the venue" language from both the pending and confirmed templates, since online bookings now pay by transfer upfront — verified neither template is ever used for a walk-in (`createWalkInBooking` sends no email at all; only `adminConfirmBooking` and the online-creation path send these).
- **Verified live end-to-end** (worked around this browser tool's inability to drive a native `<input type="file">` picker by uploading a test slip directly to Storage via the anon key over curl, then calling `create_booking` the same way a guest submission would): booking created as `pending`/`awaiting_verification` with the reference and slip path stored; the admin action sheet showed "Reference: GCASH-TEST-000123" and a working "View receipt" link (fetched the signed URL directly — HTTP 200, `image/png`, correct byte count); clicking "Confirm booking" flipped it to `status: confirmed`, `payment_status: paid_online`.

## iCourt Social rebrand (2026-08-05)

- **Replaced the product name and app-wide theme** from "DinkDrop" (teal `#0e2a2e` / optic-yellow `#e7f229`) to "iCourt Social" (pure black / lime-green), sourced from a real logo asset the user supplied rather than the placeholder palette proposed in "Visual direction" above.
- **Exact colors extracted from the logo file itself** via `PIL`'s `getcolors()` dominant-color histogram rather than eyeballed: `#000000` background, `#ffffff` text, `#9fce20` green (the most common non-black/white pixel). Added `#171717`/`#1f1f1f`/`#1a1a1a` as new dark-gray tones for `card`/`secondary`/`muted` surfaces per the user's explicit ask for "an additional dark gray color" — pure black everywhere would have made cards/inputs indistinguishable from the page background.
- **Only the shared `.dark` token block in `globals.css` changed** — same rollout mechanism as the earlier "Site-wide theme rollout" entry, since every page still runs on shadcn semantic tokens with no hardcoded colors. Functional status colors (available/closed greens/ambers in the booking and admin calendars) were again left untouched, same reasoning as before: that's a UX convention, not a branding surface.
- **Logo image replaces the text wordmark** in the three places it appeared (`site-header.tsx`, `admin/layout.tsx`, home page hero in `page.tsx`), cropped from the source photo down to just the wordmark (`public/icourt-social-logo.png`, 903×438) with `next/image` and explicit dimensions since it's a static import. The favicon (`src/app/icon.png`) is a separate, tighter crop of just the ball element — the ball visually doubles as the "o" in "Court" and touches the neighboring letters by design, so isolating it needed green-pixel color detection plus a per-row pixel-count pass to separate the solid ball from the thin swoosh arc above it, rather than a manual bounding box.
- **Remaining plain-text "DinkDrop" mentions renamed to "iCourt Social"**: page metadata title, the login page's "Sign in to..." heading, the reset-password description, and the home page's no-venue-configured fallback message.
- **Confirmed with you that the seeded venue's business name should also change**: renamed from `"DinkDrop Pickleball Club — BGC"` to `"iCourt Social Pickleball Court"` via the admin Venue Details form (not a direct DB edit), so the change went through `updateVenueDetails`'s normal validation/audit-log path like any admin edit would.

## Design polish pass — "under the lights" (2026-08-05)

Follow-up to the rebrand: made the shared design system more elegant/modern rather than touching individual pages, since every page already runs on the same shadcn tokens and primitives — the leverage is in the system, not per-page CSS. Signature idea: a soft directional lime glow on primary actions and selected state, evoking floodlights over a night court, plus a subtle top-lit gradient edge on cards/surfaces to read as "elevated" against pure black (a flat `ring-1 ring-foreground/10` doesn't cast against true black, so definition has to come from a highlight, not a shadow).

- **`--radius` bumped 0.625rem → 0.75rem** for a softer, more current corner radius across every `rounded-lg`/`rounded-xl` surface (buttons, cards, inputs, sheets) — one token, no per-component changes needed.
- **`Button`'s default variant** now carries a permanent faint lime edge + glow (`shadow-[...]`), intensifying on hover, instead of the old flat `hover:bg-primary/80` dimming. `outline` gets a hover border tint toward the ring color. Transition duration made explicit (200ms ease-out) for a less abrupt feel.
- **`Card`** swapped its flat `ring-1 ring-foreground/10` for a real border plus an inset top-highlight + soft ambient shadow, giving every card (login, admin forms, the home status board) a sense of depth instead of reading as a flat gray rectangle.
- **`Input`** grew from `h-8` to `h-9` (more comfortable modern touch target) with a softened focus ring.
- **Added active-page indication to both nav bars** (`site-header.tsx`'s `NavLink`, new `admin/nav-link.tsx`'s `AdminNavLink`) — a lime underline on the current section. There was previously no way to tell which page you were on from the nav itself; this is an intuitiveness fix, not just decoration. Both headers are now `sticky` with a blurred background so the nav stays reachable on long pages (the admin calendar, the booking grid) without permanently costing vertical space.
- **Admin venue page** got the same mono "eyebrow" label treatment (`VENUE & COURTS`) the home page already used for its section headers, tying the two together as one voice instead of the admin side reading like a generic dashboard bolted onto a branded marketing page.
- **Booking grid**: available/booked/closed cell colors are unchanged (still not a branding surface, per the earlier rebrand entry), but swapped `bg-emerald-50`/`bg-amber-50` for `bg-emerald-500/10`/`bg-amber-500/10` in dark mode — the `-50` shades are light-mode colors that were leaking through nearly white/cream against the pure black background; the low-opacity tint reads as a proper dark-mode tone. Selected cells got the same lime glow treatment as buttons.
- **Two real pre-existing bugs found and fixed while touring every page for this pass, neither introduced by this change**:
  - `globals.css`'s `@theme inline` block had `--font-sans: var(--font-sans);` — a self-referential no-op that meant Tailwind's `font-sans` utility never resolved to Geist at all. Every page's body text had silently been rendering in the browser's serif fallback (`Times`) since the "Site-wide theme rollout" entry, not the intended sans-serif. Fixed to `--font-sans: var(--font-geist-sans);`, matching how `--font-mono`/`--font-heading` already referenced their real Next.js font variables. Verified via computed `font-family` before/after.
  - The availability grid's selected-cell styling left a stray `dark:hover:bg-emerald-500/20` from the "available" branch un-overridden; because a hover-pseudo variant is more specific than a plain `dark:bg-primary`, hovering an already-selected time slot made it visually flicker back to the unselected green tint. Fixed by adding explicit `hover:`/`dark:hover:` overrides for the selected state's bg/text. Verified live by hovering a selected cell before and after.

## Nav polish + admin cancel-after-start bug (2026-08-05)

- **`SiteHeader` now renders on every page, including `/`.** It previously returned `null` on the home route because the home page had its own bespoke top bar (logo + a single "My bookings" link) — that bar is now removed from `page.tsx` entirely, so there's exactly one nav implementation site-wide instead of two, and the home page gets the full Home/Book/My bookings/Account nav (with "Home" correctly shown active) instead of a stripped-down version.
- **The logo now links to `/`** (was `/book`) in `site-header.tsx`, so clicking it from anywhere always returns to the marketing home page rather than jumping straight into the booking grid. Left the admin nav's logo pointing at `/admin/venue` — that's the admin section's own landing page, a different "home" for a different audience.
- **Admin calendar's booking action sheet no longer offers "Cancel booking" once a booking's start time has passed** (`booking-action-sheet.tsx`, gated on the existing `hasStarted` check). The database's `cancel_booking` function already rejects this server-side (`ALREADY_STARTED`, per the Phase-1 cancellation policy above), but the sheet was showing the button unconditionally — an admin could tap Cancel on an already-in-progress or already-elapsed booking and get a rejection instead of the action just not being offered. `BookingCard` on the member-facing `/bookings` page already gated its own Cancel button on `start > new Date()`; this brings the admin side in line with it. A still-pending, already-started booking (never confirmed, start time now in the past) correctly shows neither Cancel nor Mark-as-no-show — only Confirm — since no-show only applies to a booking that was actually confirmed.

## Admin bookings list (2026-08-05)

- **New `/admin/bookings` page** so an admin can see every pending/confirmed booking across all courts in one place, instead of having to page through the calendar day-by-day. Defaults to "All active" (`pending` + `confirmed`), with filters for status (pending-only / confirmed-only / all statuses including cancelled/completed/no-show), court, a text search (guest name/phone, reference code, **and** member full name via a small lookup against `profiles` since a member booking has no `guest_name` to match against), and an optional date range. Sorted soonest-first (ascending `time_range`), capped at 500 rows as a safety limit — matches the existing CSV export's `limit(2000)` pattern for the same reason (no pagination UI exists yet, Phase 1 doesn't need it at this volume).
- **Row click opens the same `BookingActionSheet`** already used by the admin calendar (imported directly from `admin/calendar/booking-action-sheet.tsx` rather than duplicated) — Confirm/Cancel/Mark-no-show all work identically from this list, including the "no Cancel after start" fix above. Added `revalidatePath("/admin/bookings")` to `adminCancelBooking`/`adminConfirmBooking`/`adminMarkNoShow` in `calendar/actions.ts` so those actions refresh this page too, not just the calendar.
- **Filters are a single server-rendered `<form>` with plain native `<select>`s** (not the client `Select` component) — a GET form matching this app's existing low-JS filter pattern (`/admin/members`'s search box), not a new client-state pattern. The existing `/admin/bookings/export` CSV route only ever took `from`/`to`, so "Export CSV" carries just the date range over, not the status/court/search filters.
- **Found and fixed a real bug while building this**: the status `<select>` didn't visually reset after clicking "Reset" or one of the quick-filter links, even though the underlying query correctly re-ran (the row count and results were right, just the dropdown looked stuck on the old value). This is a genuine React quirk, not a Next.js bug — React re-applies an `<input>`'s `defaultValue` on every render when the prop changes, but for an uncontrolled `<select>` it only applies `defaultValue` once, at mount; a later prop change is silently ignored. Fixed by giving the `<form>` a `key` derived from the current filter values (`key={\`${status}-${courtId}-${q}-${from}-${to}\`}`), which forces React to unmount/remount the whole filter form — and therefore re-run every field's initial-value logic from scratch — whenever any filter actually changes. Verified by inspecting the live DOM `.value` of the status select before and after clicking Reset, not just the visual appearance.

## Top customers leaderboard (2026-08-05)

- **New `/admin/customers` page**, ranking customers by number of (non-cancelled) bookings within a date range, with Week / Month / Year / Custom range filters. Week/Month/Year are Prev/This/Next-navigable (mirroring the admin calendar's Prev/Today/Next pattern) via a plain `anchor` date query param; Custom range shows From/To inputs instead, matching `/admin/bookings`'s filter-form convention. "This week" is Monday-Sunday, not a rolling 7 days, and "This month"/"This year" are real calendar boundaries — chosen because an admin thinking "this month's top customers" means the calendar month, not an arbitrary trailing window.
- **New `src/lib/period-range.ts`** (`periodBounds`, `shiftAnchor`) holds the week/month/year boundary math as pure, timezone-agnostic date-string arithmetic, anchored at UTC noon and manipulated via `setUTC*` — the same DST-safe pattern already used by `admin/calendar/page.tsx`'s `addDays`, rather than routing through `date-fns`'s local-getter-based `startOfWeek`/`startOfMonth` (which would silently use the *server process's* system timezone instead of the venue's, a real risk for functions doing calendar math on a Node backend). Paired with the existing `startOfLocalDayUtc`/`endOfLocalDayUtc` at the query boundary for the actual venue-timezone-aware UTC instant. Covered by `tests/unit/period-range.test.ts`, including a leap-year February and a week that crosses a month boundary.
- **Ranking counts every booking except `cancelled`** — a cancelled booking never happened, but a still-`pending` one is a real booking request regardless of whether an admin has confirmed it yet, so it counts. A customer's key is `booked_by` for a member or `guest_phone` (falling back to `guest_name`) for a guest, so the same guest phone number across multiple guest bookings aggregates into one row even without an account — members and guests are ranked in the same leaderboard, distinguished only by a Member/Guest badge, since "top customers" should answer "who books the most" regardless of account status.
- **Member names link to `/admin/members/[id]`** (reusing the existing member detail page); guests have no such page and render as plain text.
- **Found and fixed a real bug while building this**: a member with no `full_name` on their profile fell back to the literal string "Guest" for display, while still correctly showing a "Member" badge next to it — a contradictory, confusing row ("Guest" labeled "Member"). The guest-vs-member fallback text needed to differ by which case it was: guests fall back to "Guest" (no name given at booking time is normal for a guest), members fall back to "(no name on file)" instead (a member account missing a name is a data gap, not the same thing as being a guest).

## Thorough app-wide QA pass (2026-08-05)

Tested every page and flow live in the browser rather than just re-running the existing test suite: home (desktop + mobile), the full `/book` flow (date picker, multi-hour grid selection, booking sheet validation), a real end-to-end booking created via the same Storage-upload-then-`create_booking`-RPC path the browser uses (worked around this browser tool's inability to drive a native file input), that booking's lifecycle through the availability grid → admin calendar → admin bookings list → admin action sheet (payment proof + confirm) → guest reference-code lookup → guest self-cancel, `/login` sign-in/sign-up toggle and forgot-password, `/reset-password`, `/account` (including saving a profile name), and every admin page (Venue's 4 tabs, Calendar's walk-in flow, Bookings filters, Top Customers filters, Members search + detail, Audit Log filters). `tsc`, `eslint`, and all 59 Vitest tests pass throughout.

Two real, previously-unnoticed bugs surfaced by exercising actual data end-to-end (not just clicking through empty/happy-path screens) rather than by reading the code:

- **`bookings/guest/page.tsx`'s status badge had no `variant` prop**, so pending/confirmed/cancelled/completed/no-show all rendered as the same bright lime "default" badge — a cancelled booking looked identical to a confirmed one on the one page (guest self-service) where a guest has no other way to tell. Fixed by adding the same `STATUS_VARIANT` mapping already used on `/bookings` and the admin bookings list, so cancelled/completed render as muted `secondary` and no-show as `destructive`.
- **`bookings/booking-card.tsx`'s payment-status label was a two-way ternary** (`paid_at_venue` → "paid", everything else → "pay at venue") left over from before the manual payment-verification feature existed. Once online bookings started getting `payment_status` values of `awaiting_verification` or `paid_online` (see "Manual payment verification instead of a payment gateway" above), this ternary silently mislabeled every one of them as "(pay at venue)" on the member's own `/bookings` page — including a real, currently-confirmed, already-paid-online booking (ref `74391131`) found while testing, which would have told that member they still owed money at the venue when they'd already paid by transfer. Fixed with a proper label map covering all five `payment_status` values (`pay_at_venue`, `paid_at_venue`, `awaiting_verification`, `paid_online`, `refunded`, `partially_refunded`). Neither the admin bookings list nor the member detail page had this bug — the former shows the raw status string, the latter fetches but never renders it.

## Two booking-email gaps found while auditing "when do emails send" (2026-08-05)

Walking through every email-sending call site to answer a question about when notifications go out surfaced two real, previously-unnoticed gaps in `admin/calendar/actions.ts` — both about *who* an admin action's email should go to, not whether the email machinery itself works (it does; Resend/Mailpit delivery was never the problem).

- **A guest's pending booking never got a "confirmed" email.** `adminConfirmBooking` only ever looked up and emailed a *member* (`if (data.booked_by) { ...admin-client lookup... }`), so a guest who'd supplied their optional email got the initial "booking request received" email but nothing when an admin actually approved the payment — they'd have no way to know it was confirmed short of checking `/bookings/guest` themselves.
- **Admin-initiated cancellations sent no email at all.** `adminCancelBooking` called `cancel_booking` and revalidated paths but never touched `sendBookingCancellationEmail` — only a *self*-service cancellation (the booker cancelling their own booking, in `book/actions.ts`) notified anyone. An admin cancelling someone else's booking from the calendar or bookings list left them silently unaware their court was gone.
- **Fixed both with one shared helper**, `resolveBookingRecipientEmail(bookedBy, guestEmail)`: looks up the member's email via the service-role admin client when `booked_by` is set, otherwise falls back to the booking's own `guest_email` column (`null` for a walk-in, since those never collect one — so this naturally sends nothing for walk-ins, matching the existing "walk-ins get no email" rule without needing a special case). Both `adminConfirmBooking` and `adminCancelBooking` now call it before deciding whether to send.
- **Verified live, not just by reading the diff**: created two real guest bookings via the same Storage-upload-then-RPC path used elsewhere in this log, confirmed one and cancelled the other through the actual admin UI (not curl), and checked Mailpit for both — the confirmation landed addressed to the guest's own email, and the cancellation likewise, neither one silently dropped. Cleaned up both test bookings back to `cancelled` afterward.

## Guest email is now required for online bookings (2026-08-05)

Directly follows from the email-gap fixes above — a guest with no email on file gets zero booking notifications no matter how correct the sending logic is, which undercuts the point of fixing it. Made it required, not just encouraged.

- **New `GUEST_EMAIL_REQUIRED` check in `create_booking`** (`p_source = 'online' and p_booked_by is null and p_guest_email is null`) — a new migration (`20260805141516_require_guest_email.sql`), not an edit to the existing payment-proof migration, since that one's already applied to production. Same 14-parameter signature as before, so unlike the earlier payment-proof migration this one didn't need an explicit `drop function` first — no overload ambiguity risk. Applied to both the local dev DB and the linked production project (`supabase db push`) in this session.
- **Scoped to guest checkout specifically, not members or walk-ins**: a member's online booking still needs no `guest_email` (their account email is always used — see `resolveBookingRecipientEmail` above), and a walk-in still collects no email at all (staff-entered, in person). Mirrors the exact scoping already used for `PAYMENT_PROOF_REQUIRED` right next to it.
- **`booking-sheet.tsx`'s guest email field goes from optional to `required`**, label changed from "Email (optional)" to "Email", hint text now mentions cancellation too ("submitted, confirmed, or cancelled") since that's now a real notification path. The Zod schema (`lib/validation/booking.ts`) itself stays structurally optional — same reasoning as `paymentReference`/`paymentSlipPath`: it's shared with `createWalkInBooking`, which never has an email at all, so the requirement is enforced where the other guest-only business rules already live, in `create_booking`.
- **Updated the test suite for the new rule, not just added to it**: `tests/support/booking.ts`'s `callCreateBooking` now defaults a fixture guest email for a guest's online booking the same way it already defaults `paymentReference`/`paymentSlipPath`, so the ~25 unrelated existing tests that create guest bookings without mentioning email didn't need touching. The one existing test that specifically exercised "no email is fine" (`"stores an optional guest email when provided, and leaves it null otherwise"`) no longer describes real behavior — trimmed it to just the still-true half (stores it when provided) and added two new dedicated tests: `GUEST_EMAIL_REQUIRED` on a guest booking with `guestEmail: null`, and a combined test confirming neither a walk-in nor a member's own online booking needs one.
- **Verified end-to-end, not just via the test suite**: called `create_booking` directly with `p_guest_email: null` against the real local instance and got back `GUEST_EMAIL_REQUIRED` (`400`); signed out of the local dev browser session (harmless — that's this session's own sandboxed browser, not the real user's) and confirmed the actual rendered guest form now has `required: true` on `#guestEmail` with the browser's native "Please fill out this field" validation blocking submission.

Confirmed as non-bugs during the pass (worth recording so they aren't re-investigated later): the native `<input type="time">` fields in Hours momentarily looked like they were clipping "AM" to "AN" in a screenshot — DOM inspection showed `clientWidth === scrollWidth` (no overflow), so it's just how the OS-native time-picker glyph renders at that size, not an app bug. The audit log's "Profile" filter showing empty is also correct — it's scoped to *admin* actions on a member's account (restrict/reset no-show), not a member's own self-service edit via `/account`, which by design doesn't write to `audit_log`.
## Admin shortcut in the site header (2026-08-09)

Added an "Admin" link to the shared site header (`site-header.tsx`), shown only to a signed-in admin, between "My bookings" and "Account", styled in the lime accent so it reads as a distinct affordance. Links to `/admin/venue` (the admin section's own home, matching where the admin nav's logo already points).

- **Admin status is checked client-side.** The header is already a client component (it uses `usePathname` for active-link state and to hide itself on `/admin/*`), so rather than convert the root layout to an async server component and add an auth round-trip to *every* page's render, the header queries the current user's `profiles.role` via the browser Supabase client in a `useEffect`. A user can read their own profile row under the existing `profiles_select` RLS policy (`id = auth.uid()`), so no policy change was needed.
- **This is a convenience link, not an access boundary.** Every `/admin/*` route is still independently guarded server-side by `requireAdmin()`, which redirects non-admins — so even if the client check were somehow wrong or bypassed, the link leads nowhere a non-admin could actually use. Hiding it is purely about not showing a dead-end to non-admins.
- **Re-checks on `pathname` change** so the link appears/disappears correctly across a sign-in or sign-out within the SPA without a full reload, and guards its async `setState` with an `active` flag to avoid setting state after unmount.
- Verified live: signed out → no Admin link; signed in as a seeded admin → the lime "Admin" link appears and routes to the admin area.
