# Pickleball Court Reservation Platform — Build Spec

> Drop this file in the repo root as `PRD.md` (or paste it as your opening prompt to Claude Code).
> Then say: **"Read PRD.md. Confirm the plan and the schema with me before writing code. Then build Phase 1 only."**

---

## 0. How I want you (Claude Code) to work

- Read this entire spec before writing any code.
- **Ask me clarifying questions first.** Do not assume pricing, venue count, or payment provider.
- Build in vertical slices — one working feature end-to-end (DB → API → UI) before starting the next.
- After each slice: run the app, run the tests, and show me what changed. Don't batch 10 features then hand me a wall of diffs.
- Write the booking-conflict tests **before** the booking logic. That's the part that must never break.
- Keep a running `DECISIONS.md` of anything you chose that I didn't specify.
- Seed the DB with realistic dummy data (2 venues, 6 courts, 30 members, a week of bookings) so I can actually click around.

---

## 1. Product context

A court reservation platform for a pickleball club/venue operating in **Metro Manila, Philippines**.

Three user types:

| Role | Needs |
|---|---|
| **Player** (member or guest) | See what's open, book a court, join an open-play session, pay, cancel, get reminders |
| **Organizer** | Create open-play sessions and events, manage attendees, handle waitlists, collect payment |
| **Admin / venue staff** | Full calendar control, block courts for maintenance, walk-in bookings, no-show tracking, revenue reports |

Mobile-first. Assume ~80% of traffic is a player on a phone, on mobile data, deciding in under 60 seconds whether a court is free tonight.

---

## 2. Tech stack (use exactly this unless you flag a problem)

- **Next.js 15+ (App Router) + TypeScript** — UI and API in one codebase
- **Tailwind CSS + shadcn/ui** — components
- **Supabase** — Postgres, Auth, Row Level Security, Realtime, Storage
- **Zod** — validate every API input
- **date-fns-tz** — all time math
- **Vercel** — hosting
- **Payments:** PayMongo or Xendit (GCash, Maya, QR Ph, cards). Abstract this behind a `PaymentProvider` interface so it can be swapped.
- **Email:** Resend
- **Testing:** Vitest for logic, Playwright for the booking flow

**Do not** use localStorage for anything that matters. **Do not** put booking-conflict logic only in the client.

---

## 3. Data model

Design these tables in Supabase with RLS enabled on all of them:

```
venues          id, name, address, timezone (default 'Asia/Manila'), contact, photos[], amenities[]
courts          id, venue_id, name/number, surface, is_indoor, hourly_rate_cents, is_active
operating_hours venue_id, day_of_week, open_time, close_time
closures        court_id (nullable = whole venue), starts_at, ends_at, reason
profiles        id (= auth.uid), full_name, phone, skill_level (2.5–5.0), avatar_url, role
memberships     profile_id, tier, starts_on, ends_on, status
bookings        id, court_id, booked_by, time_range (tstzrange), status, party_size,
                total_cents, payment_status, source (online|walkin|admin), notes
booking_players booking_id, profile_id (nullable), guest_name, has_paid, share_cents
sessions        id, venue_id, title, description, starts_at, ends_at, format
                (open_play|challenge_court|clinic|tournament), skill_min, skill_max,
                capacity, price_cents, courts_used[], host_id, status
session_signups session_id, profile_id, status (confirmed|waitlisted|cancelled), paid, checked_in_at
waitlist        court_id or session_id, profile_id, desired_range, position, notified_at
credits         profile_id, balance_cents, ledger of transactions
notifications   profile_id, channel, template, payload, sent_at, read_at
audit_log       actor_id, action, entity, entity_id, before, after, created_at
```

### Non-negotiable: no double-booking

Bookings must use a Postgres exclusion constraint, not application-level checks:

```sql
ALTER TABLE bookings ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (
    court_id WITH =,
    time_range WITH &&
  ) WHERE (status IN ('confirmed', 'pending'));
```

Wrap booking creation in a Postgres function / transaction. When the constraint fires, return a clean `409 SLOT_TAKEN` and refresh the UI. Write a test that fires 20 concurrent requests at the same slot and asserts exactly one succeeds.

### Timezone rule

Store everything as `timestamptz` in UTC. Convert to `Asia/Manila` only at the render layer. Never build a date string by concatenating.

---

## 4. Capabilities

### 4.1 Auth & accounts
- Sign in with magic link, Google, and phone OTP (phone matters most here — many players won't check email)
- Profile: name, mobile, skill level, photo
- Guest checkout: book with name + mobile, no account, then offer to claim the booking
- Roles: `player`, `organizer`, `admin`, enforced in RLS policies not just the UI

### 4.2 Availability & discovery
- **Court grid view** — courts as columns, time as rows, one screen showing today. This is the primary screen.
- Date picker, "today / tomorrow / this weekend" quick filters
- Filter by venue, indoor/outdoor, time of day, duration
- Grey out past slots, closures, and maintenance blocks
- Realtime: if someone books while I'm looking, the slot updates without a refresh
- Deep-linkable URLs (`/book?venue=x&date=2026-08-01`) so it's shareable in a group chat

### 4.3 Booking a court
- Select court + start time + duration (30/60/90/120 min; configurable minimum and increment)
- Rules engine, all admin-configurable:
  - Booking window opens N days ahead
  - Minimum lead time (e.g. can't book for 10 minutes from now)
  - Max active bookings per member
  - Max hours per member per week
  - Peak vs off-peak pricing by day and time
  - Member rate vs guest rate
- **Hold the slot for 10 minutes** while payment completes; auto-release on expiry (scheduled job)
- Add players to the booking by name or by inviting them via link
- **Split payment**: divide the court fee across the party, each pays their own share, booking confirms when all (or a set minimum) have paid
- Confirmation screen with a QR code / booking reference for check-in

### 4.4 Recurring & block bookings
- Weekly recurring reservation (e.g. every Saturday 7–10am) for organizers and regulars
- Create the series, detect conflicts across the whole series up front, let me skip or reschedule individual dates
- Cancel one occurrence vs cancel the series

### 4.5 Cancellation, refunds, no-shows
- Configurable policy: free cancel up to X hours before, then Y% refund, then none
- Refund to credits by default, back to source optionally
- Cancelled slot automatically pings the waitlist
- Admin can mark no-show; N no-shows in a rolling window restricts booking privileges

### 4.6 Waitlist
- Join the waitlist for a full slot or session
- When a spot opens, notify the top of the list and give them a time-boxed claim window (e.g. 30 min) before it cascades to the next person
- Show my position in the queue

### 4.7 Open play & events (this is the club-side use case)
- Organizer creates a session: title, date/time, courts used, format, skill range, capacity, price, description, cover image
- Players sign up; over-capacity signups auto-waitlist
- Public shareable event page with an OG image that looks good when pasted into Facebook / Viber / WhatsApp
- Attendee list with paid/unpaid status
- Check-in screen for the day of
- **Challenge court / rotation mode** — during the session, a live queue for pairing players onto open courts, with streak tracking and match history
- Post-session: attendance summary, who owes what

### 4.8 Payments
- GCash, Maya, QR Ph, card
- Pay online, or "pay at venue" (organizer marks paid manually)
- Credits wallet: top up, spend on bookings, refunds land here
- Session/hour packages: buy 10 hours, draw down per booking
- Invoice/receipt email
- Webhook handling that is idempotent — never double-credit on a retried webhook

### 4.9 Notifications
- Booking confirmation, reminder 12h and 1h before, cancellation, waitlist offer, payment receipt
- Channels: email (Resend) + a `wa.me` / Telegram deep-link fallback so the organizer can blast the group
- Per-user notification preferences
- Design the notification layer as a queue with templates, so channels can be added later

### 4.10 Admin dashboard
- Master calendar across all courts, drag to create/move a booking
- Walk-in booking in under three taps
- Block a court for maintenance or a private event
- Manage courts, hours, rates, policies without touching code
- Member directory: search, booking history, no-show count, credit balance, manual adjustments
- Reports: utilisation % by court and hour, revenue by day/week/month, peak hour heatmap, top members, no-show rate
- CSV export
- Audit log of every admin action

---

## 5. Non-functional requirements

- **Mobile-first.** Design the phone layout first, then widen. Tap targets ≥44px.
- **Fast.** Court grid must be usable on 4G. Server-render the availability view.
- **Secure.** RLS on every table. A player can only read their own bookings and payment records. Never trust a client-supplied price — recompute server-side.
- **Rate limit** booking creation and OTP requests.
- **Accessible.** Keyboard navigable, real labels, colour is never the only status indicator.
- **Offline-tolerant.** Show a clear error and preserve form state if the network drops mid-booking.
- **Idempotency keys** on booking and payment endpoints.

---

## 6. Phasing — build in this order

**Phase 1 — MVP (make this work first)**
Auth → venues/courts CRUD → availability grid → single court booking with the exclusion constraint → cancellation → email confirmation → basic admin calendar. No payments yet; mark everything "pay at venue".

**Phase 2 — Money**
Payment provider integration, holds and auto-release, refund policy, credits wallet, receipts.

**Phase 3 — Club features**
Open play sessions, signups, waitlist, shareable event pages, check-in, challenge court rotation.

**Phase 4 — Scale**
Recurring bookings, packages, reports and heatmaps, multi-venue, no-show enforcement.

---

## 7. Open questions to ask me before starting

1. One venue or several? Do I own the courts or am I aggregating other venues?
2. Real money on day one, or pay-at-venue first?
3. Members-only, or open to the public?
4. Do I need Filipino/Taglish copy in the UI, or English only?
5. Existing brand assets and colours, or do you propose a direction?
