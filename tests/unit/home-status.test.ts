import { describe, it, expect } from "vitest";
import { computeLiveStatus } from "@/lib/home-status";

const TIMEZONE = "Asia/Manila";
const COURTS = [
  { id: "c1", name: "Court 1", is_indoor: false },
  { id: "c2", name: "Court 2", is_indoor: false },
  { id: "c3", name: "Court 3 (Indoor)", is_indoor: true },
];
const DAY_HOURS = [{ open_time: "06:00", close_time: "22:00" }];

describe("computeLiveStatus", () => {
  it("marks courts open or booked based on real-time overlap when the venue is open", () => {
    const now = new Date("2026-08-10T06:00:00+08:00"); // 2:00 PM Manila
    const result = computeLiveStatus({
      now,
      timezone: TIMEZONE,
      dayHours: DAY_HOURS,
      courts: COURTS,
      bookedSlots: [
        { court_id: "c2", time_range: '["2026-08-10T05:30:00+08:00","2026-08-10T07:00:00+08:00")' },
      ],
    });

    expect(result.isOpenNow).toBe(true);
    expect(result.courts.map((c) => [c.id, c.status])).toEqual([
      ["c1", "open"],
      ["c2", "booked"],
      ["c3", "open"],
    ]);
    expect(result.openCourtsCount).toBe(2);
    expect(result.totalCourts).toBe(3);
  });

  it("marks every court closed and reports nothing as open when outside operating hours", () => {
    const now = new Date("2026-08-10T23:00:00+08:00"); // 11:00 PM Manila, past the 22:00 close
    const result = computeLiveStatus({
      now,
      timezone: TIMEZONE,
      dayHours: DAY_HOURS,
      courts: COURTS,
      bookedSlots: [],
    });

    expect(result.isOpenNow).toBe(false);
    expect(result.openCourtsCount).toBe(0);
    expect(result.courts.every((c) => c.status === "closed")).toBe(true);
    expect(result.nextOpenLabel).toBeNull(); // already past today's only window
  });

  it("reports when the venue opens later today", () => {
    const now = new Date("2026-08-10T04:00:00+08:00"); // 4:00 AM Manila, before the 6:00 AM open
    const result = computeLiveStatus({
      now,
      timezone: TIMEZONE,
      dayHours: DAY_HOURS,
      courts: COURTS,
      bookedSlots: [],
    });

    expect(result.isOpenNow).toBe(false);
    expect(result.nextOpenLabel).toBe("6:00 AM");
  });

  it("treats a venue with no operating hours today as closed with no next-open time", () => {
    const result = computeLiveStatus({
      now: new Date("2026-08-10T06:00:00+08:00"),
      timezone: TIMEZONE,
      dayHours: [],
      courts: COURTS,
      bookedSlots: [],
    });

    expect(result.isOpenNow).toBe(false);
    expect(result.nextOpenLabel).toBeNull();
  });
});
