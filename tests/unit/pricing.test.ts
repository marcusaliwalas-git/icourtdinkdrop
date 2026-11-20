import { describe, it, expect } from "vitest";
import { rateForHour, computeBookingTotalCents, allRatesCents } from "@/lib/pricing";

const TIMEZONE = "Asia/Manila";

// 7am-2pm at PHP 400/hr, 2pm onwards at PHP 500/hr — the example from the pricing brief.
const RATE_PERIODS = [
  { start_time: "07:00", end_time: "14:00", hourly_rate_cents: 40000, member_rate_cents: null },
  { start_time: "14:00", end_time: "23:00", hourly_rate_cents: 50000, member_rate_cents: 45000 },
];

describe("rateForHour", () => {
  it("uses the matching rate period's rate", () => {
    expect(
      rateForHour({
        localStartMinutes: 8 * 60,
        ratePeriods: RATE_PERIODS,
        baseHourlyRateCents: 60000,
        baseMemberRateCents: null,
        isMember: false,
      })
    ).toBe(40000);
  });

  it("switches to the next period exactly at its boundary", () => {
    expect(
      rateForHour({
        localStartMinutes: 14 * 60,
        ratePeriods: RATE_PERIODS,
        baseHourlyRateCents: 60000,
        baseMemberRateCents: null,
        isMember: false,
      })
    ).toBe(50000);
  });

  it("falls back to the court's base rate outside every period", () => {
    expect(
      rateForHour({
        localStartMinutes: 6 * 60,
        ratePeriods: RATE_PERIODS,
        baseHourlyRateCents: 60000,
        baseMemberRateCents: 55000,
        isMember: false,
      })
    ).toBe(60000);
  });

  it("applies the member rate for a period that has one", () => {
    expect(
      rateForHour({
        localStartMinutes: 15 * 60,
        ratePeriods: RATE_PERIODS,
        baseHourlyRateCents: 60000,
        baseMemberRateCents: null,
        isMember: true,
      })
    ).toBe(45000);
  });

  it("falls back to the period's own guest rate when it has no member rate set", () => {
    expect(
      rateForHour({
        localStartMinutes: 8 * 60,
        ratePeriods: RATE_PERIODS,
        baseHourlyRateCents: 60000,
        baseMemberRateCents: 55000,
        isMember: true,
      })
    ).toBe(40000);
  });
});

describe("computeBookingTotalCents", () => {
  it("splits a booking that crosses a rate-period boundary", () => {
    // 1pm-3pm: one hour at 400, one hour at 500.
    const total = computeBookingTotalCents({
      startsAtIso: "2026-08-10T05:00:00.000Z", // 1:00 PM Manila
      durationMinutes: 120,
      timezone: TIMEZONE,
      ratePeriods: RATE_PERIODS,
      baseHourlyRateCents: 60000,
      baseMemberRateCents: null,
      isMember: false,
    });
    expect(total).toBe(40000 + 50000);
  });

  it("charges a flat rate when no period applies", () => {
    const total = computeBookingTotalCents({
      startsAtIso: "2026-08-10T22:00:00.000Z", // 6:00 AM Manila, before any period
      durationMinutes: 60,
      timezone: TIMEZONE,
      ratePeriods: RATE_PERIODS,
      baseHourlyRateCents: 60000,
      baseMemberRateCents: null,
      isMember: false,
    });
    expect(total).toBe(60000);
  });
});

describe("day-based rates", () => {
  // A weekend-only override (Sat=6, Sun=0) on top of an all-days base period, both covering 3pm.
  const DAY_PERIODS = [
    { start_time: "07:00", end_time: "23:00", hourly_rate_cents: 40000, member_rate_cents: null },
    { start_time: "07:00", end_time: "23:00", hourly_rate_cents: 60000, member_rate_cents: null, days_of_week: [0, 6] },
  ];

  it("applies a day-scoped period only on its weekdays", () => {
    // Saturday → weekend rate.
    expect(
      rateForHour({
        localStartMinutes: 15 * 60,
        dayOfWeek: 6,
        ratePeriods: DAY_PERIODS,
        baseHourlyRateCents: 30000,
        baseMemberRateCents: null,
        isMember: false,
      })
    ).toBe(60000);
    // Monday → the all-days period wins (weekend period doesn't apply).
    expect(
      rateForHour({
        localStartMinutes: 15 * 60,
        dayOfWeek: 1,
        ratePeriods: DAY_PERIODS,
        baseHourlyRateCents: 30000,
        baseMemberRateCents: null,
        isMember: false,
      })
    ).toBe(40000);
  });

  it("treats null/empty days_of_week as every day", () => {
    for (const dayOfWeek of [0, 3, 6]) {
      expect(
        rateForHour({
          localStartMinutes: 8 * 60,
          dayOfWeek,
          ratePeriods: [{ start_time: "07:00", end_time: "14:00", hourly_rate_cents: 40000, member_rate_cents: null }],
          baseHourlyRateCents: 30000,
          baseMemberRateCents: null,
          isMember: false,
        })
      ).toBe(40000);
    }
  });

  it("prices the same slot differently by weekday", () => {
    // 3pm-4pm on Saturday vs Monday, using the venue timezone to pick the weekday.
    const saturday = computeBookingTotalCents({
      startsAtIso: "2026-08-15T07:00:00.000Z", // 3:00 PM Manila, Saturday
      durationMinutes: 60,
      timezone: TIMEZONE,
      ratePeriods: DAY_PERIODS,
      baseHourlyRateCents: 30000,
      baseMemberRateCents: null,
      isMember: false,
    });
    const monday = computeBookingTotalCents({
      startsAtIso: "2026-08-10T07:00:00.000Z", // 3:00 PM Manila, Monday
      durationMinutes: 60,
      timezone: TIMEZONE,
      ratePeriods: DAY_PERIODS,
      baseHourlyRateCents: 30000,
      baseMemberRateCents: null,
      isMember: false,
    });
    expect(saturday).toBe(60000);
    expect(monday).toBe(40000);
  });
});

describe("allRatesCents", () => {
  it("lists the base rate plus every period's rate", () => {
    const rates = allRatesCents({
      baseHourlyRateCents: 60000,
      baseMemberRateCents: null,
      ratePeriods: RATE_PERIODS,
      isMember: false,
    });
    expect(rates.sort((a, b) => a - b)).toEqual([40000, 50000, 60000]);
  });
});
