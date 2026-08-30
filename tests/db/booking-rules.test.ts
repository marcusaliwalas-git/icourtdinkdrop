import { describe, it, expect, afterAll } from "vitest";
import { withRollback, closePool } from "../support/db";
import { createVenueWithCourt, createMemberProfile, createAdminProfile, actAsAdmin } from "../support/fixtures";
import { callCreateBooking, callCancelBooking, callConfirmBooking, callMarkNoShow, callRescheduleBooking } from "../support/booking";

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

  it("creates a valid online booking as pending and computes the guest rate", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client, {
        hourlyRateCents: 120000,
      });

      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 120,
        guestName: "Juan Dela Cruz",
        guestPhone: "+639171234567",
      });

      expect(booking.status).toBe("pending");
      expect(booking.payment_status).toBe("awaiting_verification");
      expect(booking.total_cents).toBe(240000); // 120000 * 2h
      expect(booking.reference_code).toHaveLength(8);
    });
  });

  it("stores the guest's email", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);

      const withEmail = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        guestName: "Has Email",
        guestPhone: "+639170000060",
        guestEmail: "guest@example.com",
      });
      expect(withEmail.guest_email).toBe("guest@example.com");
    });
  });

  it("auto-confirms walk-in and admin-sourced bookings instead of leaving them pending", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);

      const walkin = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        guestName: "Walkin",
        guestPhone: "+639170000030",
        source: "walkin",
      });
      expect(walkin.status).toBe("confirmed");
    });
  });

  it("rejects a duration that isn't a whole number of hours", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);

      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt: daysFromNow(2),
          durationMinutes: 90,
          guestName: "Odd",
          guestPhone: "+639170000031",
        })
      ).rejects.toThrow(/INVALID_DURATION/);
    });
  });

  it("rejects a duration longer than 24 hours", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);

      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt: daysFromNow(2),
          durationMinutes: 1500,
          guestName: "TooLong",
          guestPhone: "+639170000032",
        })
      ).rejects.toThrow(/INVALID_DURATION/);
    });
  });

  it("rejects a 24-hour booking that would run past the same day's closing time", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);

      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt: daysFromNow(2, 10),
          durationMinutes: 1440,
          guestName: "FullDay",
          guestPhone: "+639170000033",
        })
      ).rejects.toThrow(/OUTSIDE_OPERATING_HOURS/);
    });
  });

  it("rejects a booking whose duration would run past midnight into the next calendar day", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      // Fixture hours are 00:00-23:45 local. 11:00 PM local (UTC 15:00, Manila is UTC+8)
      // + 2 hours would end at 1:00 AM the next day — must be rejected, not silently allowed.
      const startsAt = daysFromNow(2, 15);

      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt,
          durationMinutes: 120,
          guestName: "Overnight",
          guestPhone: "+639170000034",
        })
      ).rejects.toThrow(/OUTSIDE_OPERATING_HOURS/);
    });
  });

  it("allows a duration that reaches exactly the closing time", async () => {
    await withRollback(async (client) => {
      const { courtId, venueId } = await createVenueWithCourt(client);
      await client.query(`update operating_hours set open_time = '06:00', close_time = '22:00' where venue_id = $1`, [
        venueId,
      ]);
      // UTC 12:00 = 20:00 Manila; + 2 hours ends exactly at the 22:00 close.
      const startsAt = daysFromNow(2, 12);

      const booking = await callCreateBooking(client, {
        courtId,
        startsAt,
        durationMinutes: 120,
        guestName: "JustInTime",
        guestPhone: "+639170000035",
      });

      expect(booking.status).toBe("pending");
    });
  });

  it("rejects a duration that runs just one hour past the closing time", async () => {
    await withRollback(async (client) => {
      const { courtId, venueId } = await createVenueWithCourt(client);
      await client.query(`update operating_hours set open_time = '06:00', close_time = '22:00' where venue_id = $1`, [
        venueId,
      ]);
      // Same start as above, but one hour longer — now ends at 23:00, past the 22:00 close.
      const startsAt = daysFromNow(2, 12);

      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt,
          durationMinutes: 180,
          guestName: "OneTooMany",
          guestPhone: "+639170000036",
        })
      ).rejects.toThrow(/OUTSIDE_OPERATING_HOURS/);
    });
  });

  // A Manila (UTC+8) wall-clock time `daysAhead` days out, as a UTC Date.
  function manilaFuture(daysAhead: number, hhmm: string): Date {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysAhead);
    return new Date(`${d.toISOString().slice(0, 10)}T${hhmm}:00+08:00`);
  }

  async function makeOvernightVenue(client: import("pg").PoolClient) {
    const fixture = await createVenueWithCourt(client);
    // Every day: open 6 PM, close 2 AM the next day.
    await client.query(
      `update operating_hours set open_time = '18:00', close_time = '02:00', closes_next_day = true where venue_id = $1`,
      [fixture.venueId]
    );
    return fixture;
  }

  it("allows an overnight booking that crosses midnight", async () => {
    await withRollback(async (client) => {
      const { courtId } = await makeOvernightVenue(client);
      // 11 PM → 2 AM: starts on the open day, ends at the overnight close.
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: manilaFuture(4, "23:00"),
        durationMinutes: 180,
        guestName: "NightOwl",
        guestPhone: "+639170000040",
      });
      expect(booking.status).toBe("pending");
    });
  });

  it("allows a booking in the early-morning tail of the previous day's overnight session", async () => {
    await withRollback(async (client) => {
      const { courtId } = await makeOvernightVenue(client);
      // 1 AM → 2 AM belongs to the prior day's 6 PM–2 AM session.
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: manilaFuture(4, "01:00"),
        durationMinutes: 60,
        guestName: "AfterMidnight",
        guestPhone: "+639170000041",
      });
      expect(booking.status).toBe("pending");
    });
  });

  it("rejects a booking after the overnight session has closed", async () => {
    await withRollback(async (client) => {
      const { courtId } = await makeOvernightVenue(client);
      // 3 AM is past the 2 AM close and before the 6 PM open — outside hours.
      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt: manilaFuture(4, "03:00"),
          durationMinutes: 60,
          guestName: "TooLate",
          guestPhone: "+639170000042",
        })
      ).rejects.toThrow(/OUTSIDE_OPERATING_HOURS/);
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

  it("rejects a booking outside the venue's operating hours (same day, no wrap)", async () => {
    await withRollback(async (client) => {
      const { courtId, venueId } = await createVenueWithCourt(client);
      // Narrow the fixture's default 00:00-23:45 hours down to 08:00-20:00 so a same-day
      // out-of-hours booking is actually reachable without wrapping past midnight (crossing
      // midnight is now allowed — see the 24-hour-booking test below).
      await client.query(
        `update operating_hours set open_time = '08:00', close_time = '20:00' where venue_id = $1`,
        [venueId]
      );
      // Venue timezone is Asia/Manila (UTC+8): UTC 13:00 = 21:00 local, ending 22:00
      // local — same day (no wrap), past the 20:00 close.
      const startsAt = daysFromNow(2, 13);

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

      expect(a.status).toBe("pending");
      expect(b.status).toBe("pending");
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
        `select count(*)::int as count from bookings where court_id = $1 and status in ('confirmed', 'pending')`,
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

  it("requires a payment slip for an online booking, even when a reference is given", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);

      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt: daysFromNow(2),
          durationMinutes: 60,
          guestName: "Juan Dela Cruz",
          guestPhone: "+639171234567",
          paymentReference: "GCASH-REF-123",
          paymentSlipPath: null,
        })
      ).rejects.toThrow(/PAYMENT_PROOF_REQUIRED/);
    });
  });

  it("allows an online booking with a slip but no reference (the reference is optional)", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);

      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        guestName: "Juan Dela Cruz",
        guestPhone: "+639171234567",
        paymentReference: null,
        paymentSlipPath: "test-fixtures/slip.jpg",
      });

      expect(booking.status).toBe("pending");
      expect(booking.payment_reference).toBeNull();
    });
  });

  it("requires an email for a guest's online booking", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);

      await expect(
        callCreateBooking(client, {
          courtId,
          startsAt: daysFromNow(2),
          durationMinutes: 60,
          guestName: "Juan Dela Cruz",
          guestPhone: "+639171234567",
          guestEmail: null,
        })
      ).rejects.toThrow(/GUEST_EMAIL_REQUIRED/);
    });
  });

  it("does not require a guest email for walk-in bookings, or any email for a member's own online booking", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const profileId = await createMemberProfile(client);

      const walkin = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        guestName: "Juan Dela Cruz",
        guestPhone: "+639171234567",
        source: "walkin",
        guestEmail: null,
      });
      expect(walkin.status).toBe("confirmed");

      const memberBooking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(3),
        durationMinutes: 60,
        bookedBy: profileId,
        guestEmail: null,
      });
      expect(memberBooking.status).toBe("pending");
    });
  });

  it("does not require a payment reference or slip for walk-in/admin-sourced bookings", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);

      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        guestName: "Juan Dela Cruz",
        guestPhone: "+639171234567",
        source: "walkin",
        paymentReference: null,
        paymentSlipPath: null,
      });

      expect(booking.status).toBe("confirmed");
      expect(booking.payment_status).toBe("pay_at_venue");
      expect(booking.payment_reference).toBeNull();
      expect(booking.payment_slip_path).toBeNull();
    });
  });
});

describe("confirm_booking", () => {
  afterAll(closePool);

  it("confirms a pending booking", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const adminId = await createAdminProfile(client);
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        guestName: "Awaiting",
        guestPhone: "+639170000040",
      });
      expect(booking.status).toBe("pending");

      await actAsAdmin(client, adminId);
      const confirmed = await callConfirmBooking(client, booking.id);
      expect(confirmed.status).toBe("confirmed");
      // Confirming is the admin's signal that they checked the reference/slip and the
      // transfer is legit — see confirm_booking's comment for why this is safe to do
      // unconditionally (only ever reachable for online bookings with proof attached).
      expect(confirmed.payment_status).toBe("paid_online");
    });
  });

  it("rejects confirming a booking that isn't pending", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const adminId = await createAdminProfile(client);
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        guestName: "AlreadyIn",
        guestPhone: "+639170000041",
        source: "walkin",
      });
      expect(booking.status).toBe("confirmed");

      await actAsAdmin(client, adminId);
      await expect(callConfirmBooking(client, booking.id)).rejects.toThrow(/NOT_PENDING/);
    });
  });

  it("rejects confirming a booking when the caller isn't an admin", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        guestName: "NoAdmin",
        guestPhone: "+639170000042",
      });

      await expect(callConfirmBooking(client, booking.id)).rejects.toThrow(/NOT_AUTHORIZED/);
    });
  });
});

describe("mark_no_show", () => {
  afterAll(closePool);

  it("marks a started, confirmed booking as no-show and increments the member's counter", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const adminId = await createAdminProfile(client);
      const memberId = await createMemberProfile(client);
      const startsAt = new Date(Date.now() - 60 * 60 * 1000); // started an hour ago

      const { rows } = await client.query(
        `insert into bookings (court_id, booked_by, time_range, status, total_cents)
         values ($1, $2, tstzrange($3::timestamptz, $3::timestamptz + interval '60 minutes'), 'confirmed', 100000)
         returning id`,
        [courtId, memberId, startsAt.toISOString()]
      );

      await actAsAdmin(client, adminId);
      const result = await callMarkNoShow(client, rows[0].id);
      expect(result.status).toBe("no_show");

      const { rows: profileRows } = await client.query(
        `select no_show_count from profiles where id = $1`,
        [memberId]
      );
      expect(profileRows[0].no_show_count).toBe(1);
    });
  });

  it("rejects marking a booking that hasn't started yet", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const adminId = await createAdminProfile(client);
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2),
        durationMinutes: 60,
        guestName: "Future",
        guestPhone: "+639170000050",
        source: "walkin",
      });

      await actAsAdmin(client, adminId);
      await expect(callMarkNoShow(client, booking.id)).rejects.toThrow(/NOT_STARTED_YET/);
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

describe("reschedule_booking", () => {
  afterAll(closePool);

  // A court whose 18:00–22:00 local window is peak (₱1,500/hr) and everything else is the
  // flat ₱1,000/hr base — lets the settle-up vs forfeit logic be exercised by moving a
  // booking between an off-peak and a peak hour.
  async function makePeakCourt(client: import("pg").PoolClient) {
    const fixture = await createVenueWithCourt(client, { hourlyRateCents: 100000 });
    await client.query(
      `insert into court_rate_periods (court_id, start_time, end_time, hourly_rate_cents, member_rate_cents)
       values ($1, '18:00', '22:00', 150000, null)`,
      [fixture.courtId]
    );
    return fixture;
  }

  it("moves a booking to a new time on the same court, keeping its duration", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const adminId = await createAdminProfile(client);
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2, 2),
        durationMinutes: 120,
        guestName: "Mover",
        guestPhone: "+639170000070",
      });

      await actAsAdmin(client, adminId);
      const newStart = daysFromNow(3, 4);
      const moved = await callRescheduleBooking(client, booking.id, courtId, newStart);

      const { rows } = await client.query(
        `select lower(time_range) as lo, upper(time_range) as hi from bookings where id = $1`,
        [moved.id]
      );
      expect(new Date(rows[0].lo).toISOString()).toBe(newStart.toISOString());
      expect((rows[0].hi.getTime() - rows[0].lo.getTime()) / 60000).toBe(120);
    });
  });

  it("settles up to the new price when the destination slot is more expensive", async () => {
    await withRollback(async (client) => {
      const { courtId } = await makePeakCourt(client);
      const adminId = await createAdminProfile(client);
      // Off-peak 10:00 local (UTC 02:00) at ₱1,000.
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2, 2),
        durationMinutes: 60,
        guestName: "Upgrader",
        guestPhone: "+639170000071",
      });
      expect(booking.total_cents).toBe(100000);

      await actAsAdmin(client, adminId);
      // Peak 18:00 local (UTC 10:00) at ₱1,500 — admin collects the ₱500 difference.
      const moved = await callRescheduleBooking(client, booking.id, courtId, daysFromNow(3, 10));
      expect(moved.total_cents).toBe(150000);
    });
  });

  it("keeps the original (higher) total and forfeits the difference when the destination is cheaper", async () => {
    await withRollback(async (client) => {
      const { courtId } = await makePeakCourt(client);
      const adminId = await createAdminProfile(client);
      // Peak 18:00 local at ₱1,500.
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2, 10),
        durationMinutes: 60,
        guestName: "Downgrader",
        guestPhone: "+639170000072",
      });
      expect(booking.total_cents).toBe(150000);

      await actAsAdmin(client, adminId);
      // Off-peak 10:00 local would price at ₱1,000, but no refund — total stays ₱1,500.
      const moved = await callRescheduleBooking(client, booking.id, courtId, daysFromNow(3, 2));
      expect(moved.total_cents).toBe(150000);
    });
  });

  it("rejects moving onto a slot another active booking already holds", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const adminId = await createAdminProfile(client);
      const occupiedStart = daysFromNow(2, 2);
      await callCreateBooking(client, {
        courtId,
        startsAt: occupiedStart,
        durationMinutes: 60,
        guestName: "Sitting",
        guestPhone: "+639170000073",
      });
      const moving = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2, 4),
        durationMinutes: 60,
        guestName: "Colliding",
        guestPhone: "+639170000074",
      });

      await actAsAdmin(client, adminId);
      await expect(
        callRescheduleBooking(client, moving.id, courtId, occupiedStart)
      ).rejects.toThrow(/SLOT_TAKEN/);
    });
  });

  it("rejects a destination slot outside operating hours", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client); // hours 00:00–23:45
      const adminId = await createAdminProfile(client);
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2, 2),
        durationMinutes: 60,
        guestName: "Nightowl",
        guestPhone: "+639170000075",
      });

      await actAsAdmin(client, adminId);
      // 23:00 local (UTC 15:00) + 1h ends at 24:00 > 23:45 close.
      await expect(
        callRescheduleBooking(client, booking.id, courtId, daysFromNow(3, 15))
      ).rejects.toThrow(/OUTSIDE_OPERATING_HOURS/);
    });
  });

  it("rejects rescheduling a booking that has already started", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const adminId = await createAdminProfile(client);
      const startsAt = new Date(Date.now() - 5 * 60 * 1000);
      const { rows } = await client.query(
        `insert into bookings (court_id, guest_name, guest_phone, time_range, status, total_cents)
         values ($1, 'Started', '+639170000076', tstzrange($2::timestamptz, $2::timestamptz + interval '60 minutes'), 'confirmed', 100000)
         returning id`,
        [courtId, startsAt.toISOString()]
      );

      await actAsAdmin(client, adminId);
      await expect(
        callRescheduleBooking(client, rows[0].id, courtId, daysFromNow(3, 4))
      ).rejects.toThrow(/ALREADY_STARTED/);
    });
  });

  it("rejects a cancelled booking", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const adminId = await createAdminProfile(client);
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2, 2),
        durationMinutes: 60,
        guestName: "Gone",
        guestPhone: "+639170000077",
      });
      await client.query(`update bookings set status = 'cancelled' where id = $1`, [booking.id]);

      await actAsAdmin(client, adminId);
      await expect(
        callRescheduleBooking(client, booking.id, courtId, daysFromNow(3, 4))
      ).rejects.toThrow(/CANNOT_RESCHEDULE/);
    });
  });

  it("rejects a non-admin caller", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const booking = await callCreateBooking(client, {
        courtId,
        startsAt: daysFromNow(2, 2),
        durationMinutes: 60,
        guestName: "NoRights",
        guestPhone: "+639170000078",
      });

      // No actAsAdmin — auth.uid() is null, so is_admin() is false.
      await expect(
        callRescheduleBooking(client, booking.id, courtId, daysFromNow(3, 4))
      ).rejects.toThrow(/NOT_AUTHORIZED/);
    });
  });
});
