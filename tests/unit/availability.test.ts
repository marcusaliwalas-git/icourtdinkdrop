import { describe, it, expect } from "vitest";
import { buildAvailabilityGrid, buildAdminCalendarGrid } from "@/lib/availability";

const TIMEZONE = "Asia/Manila";
const DATE = "2026-08-10"; // a Monday, arbitrary
const COURT = { id: "court-1", name: "Court 1" };

// Fixed reference point well before any of the rows below, so nothing accidentally falls
// into the "past" bucket.
const FAR_PAST_NOW = new Date("2020-01-01T00:00:00Z");

describe("buildAvailabilityGrid", () => {
  it("only generates whole-hour rows, not 30-minute ones", () => {
    const grid = buildAvailabilityGrid({
      date: DATE,
      timezone: TIMEZONE,
      slotMinutes: 60,
      courts: [COURT],
      dayHours: [{ open_time: "06:00", close_time: "09:00" }],
      bookedSlots: [],
      closures: [],
      now: FAR_PAST_NOW,
    });

    expect(grid.rows.map((r) => r.label)).toEqual(["6:00 AM", "7:00 AM", "8:00 AM"]);
  });

  it("extends past midnight for an overnight session, rolling into the next date", () => {
    const grid = buildAvailabilityGrid({
      date: DATE,
      timezone: TIMEZONE,
      slotMinutes: 60,
      courts: [COURT],
      dayHours: [{ open_time: "22:00", close_time: "02:00", closes_next_day: true }],
      bookedSlots: [],
      closures: [],
      now: FAR_PAST_NOW,
    });

    // 10 PM → 2 AM: the last two rows are after midnight, still on the opening day's grid.
    expect(grid.rows.map((r) => r.label)).toEqual(["10:00 PM", "11:00 PM", "12:00 AM", "1:00 AM"]);
    // The after-midnight rows are flagged so the UI can mark them as the next day.
    expect(grid.rows.map((r) => r.nextDay)).toEqual([false, false, true, true]);
    // The 1 AM row's actual instant is the next calendar date (Aug 11 at 01:00 Manila = 17:00 UTC Aug 10).
    expect(grid.rows[3].startsAtIso).toBe("2026-08-10T17:00:00.000Z");
  });

  it("anchors rows to the admin-configured open_time, not a fixed clock grid", () => {
    const grid = buildAvailabilityGrid({
      date: DATE,
      timezone: TIMEZONE,
      slotMinutes: 60,
      courts: [COURT],
      dayHours: [{ open_time: "06:30", close_time: "09:30" }],
      bookedSlots: [],
      closures: [],
      now: FAR_PAST_NOW,
    });

    // Anchored to 06:30, so rows land on the half-hour throughout — this is what "depends on
    // the admin setup" means: whatever open_time the admin sets becomes the grid's anchor.
    expect(grid.rows.map((r) => r.label)).toEqual(["6:30 AM", "7:30 AM", "8:30 AM"]);
  });

  it("drops a trailing partial hour that doesn't fit before close_time", () => {
    const grid = buildAvailabilityGrid({
      date: DATE,
      timezone: TIMEZONE,
      slotMinutes: 60,
      courts: [COURT],
      dayHours: [{ open_time: "06:00", close_time: "08:30" }],
      bookedSlots: [],
      closures: [],
      now: FAR_PAST_NOW,
    });

    // 08:00-09:00 would run past the 08:30 close, so only two full hourly slots fit.
    expect(grid.rows.map((r) => r.label)).toEqual(["6:00 AM", "7:00 AM"]);
  });

  it("marks a row booked when it overlaps a booking_slots entry for that court", () => {
    const grid = buildAvailabilityGrid({
      date: DATE,
      timezone: TIMEZONE,
      slotMinutes: 60,
      courts: [COURT],
      dayHours: [{ open_time: "06:00", close_time: "09:00" }],
      bookedSlots: [
        { court_id: COURT.id, time_range: '["2026-08-10T07:00:00+08:00","2026-08-10T08:00:00+08:00")' },
      ],
      closures: [],
      now: FAR_PAST_NOW,
    });

    expect(grid.rows.map((r) => r.cells[COURT.id])).toEqual(["available", "booked", "available"]);
  });

  it("marks a row closed when it overlaps a closure for that court", () => {
    const grid = buildAvailabilityGrid({
      date: DATE,
      timezone: TIMEZONE,
      slotMinutes: 60,
      courts: [COURT],
      dayHours: [{ open_time: "06:00", close_time: "09:00" }],
      bookedSlots: [],
      closures: [{ court_id: COURT.id, starts_at: "2026-08-10T00:00:00+08:00", ends_at: "2026-08-10T08:00:00+08:00" }],
      now: FAR_PAST_NOW,
    });

    expect(grid.rows.map((r) => r.cells[COURT.id])).toEqual(["closed", "closed", "available"]);
  });

  it("marks rows before `now` as past", () => {
    const grid = buildAvailabilityGrid({
      date: DATE,
      timezone: TIMEZONE,
      slotMinutes: 60,
      courts: [COURT],
      dayHours: [{ open_time: "06:00", close_time: "09:00" }],
      bookedSlots: [],
      closures: [],
      now: new Date("2026-08-10T07:30:00+08:00"), // 07:30 AM local on the 10th
    });

    expect(grid.rows.map((r) => r.cells[COURT.id])).toEqual(["past", "past", "available"]);
  });

  it("reports closedAllDay when the venue has no operating hours that day", () => {
    const grid = buildAvailabilityGrid({
      date: DATE,
      timezone: TIMEZONE,
      slotMinutes: 60,
      courts: [COURT],
      dayHours: [],
      bookedSlots: [],
      closures: [],
    });

    expect(grid.closedAllDay).toBe(true);
    expect(grid.rows).toEqual([]);
  });
});

describe("buildAdminCalendarGrid", () => {
  it("only generates whole-hour rows and carries the booking's label and status", () => {
    const grid = buildAdminCalendarGrid({
      date: DATE,
      timezone: TIMEZONE,
      slotMinutes: 60,
      courts: [COURT],
      dayHours: [{ open_time: "06:00", close_time: "09:00" }],
      bookings: [
        {
          id: "booking-1",
          court_id: COURT.id,
          time_range: '["2026-08-10T07:00:00+08:00","2026-08-10T08:00:00+08:00")',
          status: "pending",
          guest_name: "Guest Name",
          profiles: null,
        },
      ],
      closures: [],
      now: FAR_PAST_NOW,
    });

    expect(grid.rows.map((r) => r.label)).toEqual(["6:00 AM", "7:00 AM", "8:00 AM"]);
    expect(grid.rows[1].cells[COURT.id]).toMatchObject({
      status: "booked",
      bookingId: "booking-1",
      label: "Guest Name",
      bookingStatus: "pending",
    });
    expect(grid.rows[0].cells[COURT.id].status).toBe("available");
  });
});
