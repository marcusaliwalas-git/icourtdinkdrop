import { describe, it, expect, afterAll } from "vitest";
import { withRollback, closePool } from "../support/db";
import { createVenueWithCourt, createMemberProfile } from "../support/fixtures";
import { callCreateBooking, callCancelBooking } from "../support/booking";

// These tests hit a real local Supabase Postgres (see tests/support/db.ts) because the
// booking-conflict guarantee lives in the database, not in application code (PRD.md
// "Non-negotiable: no double-booking"). Each test runs in its own transaction that is
// rolled back afterwards, so fixtures never leak between tests.

function daysFromNow(days: number, hour = 10): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

describe("create_booking — pricing and rules", () => {
  afterAll(closePool);

  it("confirms a valid booking and computes the guest rate from the court's hourly rate", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client, {
        hourlyRateCents: 120000,
      });

      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 90,
        guestName: "Juan Dela Cruz",
        guestPhone: "+639171234567",
      });

      expect(booking.status).toBe("confirmed");
      expect(booking.payment_status).toBe("pay_at_venue");
      expect(booking.total_cents).toBe(180000); // 120000 * 1.5h
      expect(booking.reference_code).toHaveLength(8);
    });
  });

  it("uses the member rate when the booker has an active membership", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client, {
        hourlyRateCents: 120000,
        memberRateCents: 90000,
      });
      const profileId = await createMemberProfile(client);

      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        bookedBy: profileId,
      });

      expect(booking.total_cents).toBe(90000);
    });
  });

  it("falls back to the guest/hourly rate when membership has expired", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client, {
        hourlyRateCents: 120000,
        memberRateCents: 90000,
      });
      const profileId = await createMemberProfile(client, { active: false });

      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        bookedBy: profileId,
      });

      expect(booking.total_cents).toBe(120000);
    });
  });

  it("rejects a booking that starts sooner than the venue's minimum lead time", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client, {
        minLeadMinutes: 120,
      });
      const startsAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt,
          durationMinutes: 60,
          guestName: "Rushed",
          guestPhone: "+639170000010",
        })
      ).rejects.toThrow(/LEAD_TIME_TOO_SHORT/);
    });
  });

  it("rejects a booking beyond the venue's max advance window", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client, {
        maxAdvanceDays: 14,
      });

      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt: daysFromNow(30),
          durationMinutes: 60,
          guestName: "TooFar",
          guestPhone: "+639170000011",
        })
      ).rejects.toThrow(/OUTSIDE_BOOKING_WINDOW/);
    });
  });

  it("rejects a booking outside the venue's operating hours", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      // Venue timezone is Asia/Manila (UTC+8). Fixture operating hours are 00:00-23:45
      // local; a 23:30 local start + 60min crosses midnight, so UTC 15:30 (= 23:30 Manila).
      const startsAt = daysFromNow(2, 15);
      startsAt.setUTCMinutes(30);

      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt,
          durationMinutes: 60,
          guestName: "Late",
          guestPhone: "+639170000009",
        })
      ).rejects.toThrow(/OUTSIDE_OPERATING_HOURS/);
    });
  });

  it("rejects a booking that overlaps a closure", async () => {
    await withRollback(async (client) => {
      const { courtId, venueId } = await createVenueWithCourt(client);
      const startsAt = daysFromNow(2);
      const closureStart = new Date(startsAt.getTime() - 30 * 60 * 1000);
      const closureEnd = new Date(startsAt.getTime() + 30 * 60 * 1000);

      await client.query(
        `insert into closures (venue_id, court_id, starts_at, ends_at, reason)
         values ($1, $2, $3, $4, 'Maintenance')`,
        [venueId, courtId, closureStart.toISOString(), closureEnd.toISOString()]
      );

      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt,
          durationMinutes: 60,
          guestName: "Blocked",
          guestPhone: "+639170000012",
        })
      ).rejects.toThrow(/COURT_CLOSED/);
    });
  });

  it("allows back-to-back bookings that touch but don't overlap", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const first = daysFromNow(2, 10);

      const a = await callCreateBooking(client, {
        courtId,
        startsAt: first,
        durationMinutes: 60,
        guestName: "A",
        guestPhone: "+639170000001",
      });
      const b = await callCreateBooking(client, {
        courtId,
        startsAt: new Date(first.getTime() + 60 * 60 * 1000),
        durationMinutes: 60,
        guestName: "B",
        guestPhone: "+639170000002",
      });

      expect(a.status).toBe("confirmed");
      expect(b.status).toBe("confirmed");
    });
  });

  it("rejects an overlapping booking on the same court with a conflict error", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const startsAt = daysFromNow(3, 14);

      await callCreateBooking(client, {
        courtId,
        startsAt,
        durationMinutes: 60,
        guestName: "First",
        guestPhone: "+639170000003",
      });

      const overlapping = new Date(startsAt.getTime() + 30 * 60 * 1000);
      // A failed statement aborts the rest of the ongoing transaction until rolled back
      // to a savepoint — needed here since we run a follow-up assertion query afterwards.
      await client.query("savepoint conflict_check");
      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt: overlapping,
          durationMinutes: 60,
          guestName: "Second",
          guestPhone: "+639170000004",
        })
      ).rejects.toMatchObject({ code: "23P01" });
      await client.query("rollback to savepoint conflict_check");

      const { rows } = await client.query(
        `select count(*)::int as count from bookings where court_id = $1 and status = 'confirmed'`,
        [courtId]
      );
      expect(rows[0].count).toBe(1);
    });
  });

  it("is idempotent: replaying the same idempotency key returns the original booking", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const startsAt = daysFromNow(4, 9);
      const idempotencyKey = "test-idem-key-1";

      const first = await callCreateBooking(client, {
        courtId,
        startsAt,
        durationMinutes: 60,
        guestName: "Idem",
        guestPhone: "+639170000005",
        idempotencyKey,
      });
      const second = await callCreateBooking(client, {
        courtId,
        startsAt,
        durationMinutes: 60,
        guestName: "Idem",
        guestPhone: "+639170000005",
        idempotencyKey,
      });

      expect(second.id).toBe(first.id);

      const { rows } = await client.query(
        `select count(*)::int as count from bookings where idempotency_key = $1`,
        [idempotencyKey]
      );
      expect(rows[0].count).toBe(1);
    });
  });

  it("requires guest_name and guest_phone when there is no booked_by profile", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);

      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt: daysFromNow(2),
          durationMinutes: 60,
        })
      ).rejects.toThrow(/GUEST_INFO_REQUIRED/);
    });
  });
});

describe("cancel_booking", () => {
  afterAll(closePool);

  it("cancels a booking by its reference code (guest self-service)", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        guestName: "Cancels",
        guestPhone: "+639170000006",
      });

      const cancelled = await callCancelBooking(
        client,
        booking.id,
        booking.reference_code
      );

      expect(cancelled.status).toBe("cancelled");
    });
  });

  it("rejects cancellation with a mismatched reference code", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        guestName: "Protected",
        guestPhone: "+639170000007",
      });

      await expect(
        callCancelBooking(client, booking.id, "WRONGCODE")
      ).rejects.toThrow(/NOT_AUTHORIZED/);
    });
  });

  it("rejects cancelling a booking that has already started", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client, {
        minLeadMinutes: 0,
      });
      const startsAt = new Date(Date.now() - 5 * 60 * 1000); // started 5 min ago
      // Insert directly since create_booking enforces lead time on new bookings.
      const { rows } = await client.query(
        `insert into bookings (court_id, guest_name, guest_phone, time_range, status, total_cents)
         values ($1, 'Past', '+639170000008', tstzrange($2::timestamptz, $2::timestamptz + interval '60 minutes'), 'confirmed', 100000)
         returning id, reference_code`,
        [courtId, startsAt.toISOString()]
      );

      await expect(
        callCancelBooking(client, rows[0].id, rows[0].reference_code)
      ).rejects.toThrow(/ALREADY_STARTED/);
    });
  });
});
