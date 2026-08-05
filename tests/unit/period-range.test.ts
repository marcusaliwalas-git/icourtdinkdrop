import { describe, it, expect } from "vitest";
import { periodBounds, shiftAnchor } from "@/lib/period-range";

describe("periodBounds", () => {
  it("finds the Monday-Sunday week containing a mid-week date", () => {
    // 2026-08-05 is a Wednesday.
    expect(periodBounds("week", "2026-08-05")).toEqual({ from: "2026-08-03", to: "2026-08-09" });
  });

  it("returns the same week when the anchor is already Monday or Sunday", () => {
    expect(periodBounds("week", "2026-08-03")).toEqual({ from: "2026-08-03", to: "2026-08-09" });
    expect(periodBounds("week", "2026-08-09")).toEqual({ from: "2026-08-03", to: "2026-08-09" });
  });

  it("finds the calendar month, including 31/30/28-day and leap-year cases", () => {
    expect(periodBounds("month", "2026-08-15")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(periodBounds("month", "2026-04-01")).toEqual({ from: "2026-04-01", to: "2026-04-30" });
    expect(periodBounds("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodBounds("month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" }); // leap year
  });

  it("finds the calendar year", () => {
    expect(periodBounds("year", "2026-08-05")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("handles a week that crosses a month boundary", () => {
    // 2026-08-31 is a Monday; its week runs into September.
    expect(periodBounds("week", "2026-08-31")).toEqual({ from: "2026-08-31", to: "2026-09-06" });
  });
});

describe("shiftAnchor", () => {
  it("moves a week forward and back by 7 days", () => {
    expect(shiftAnchor("week", "2026-08-05", 1)).toBe("2026-08-12");
    expect(shiftAnchor("week", "2026-08-05", -1)).toBe("2026-07-29");
  });

  it("moves a month forward and back, including year boundaries", () => {
    expect(shiftAnchor("month", "2026-08-05", 1)).toBe("2026-09-05");
    expect(shiftAnchor("month", "2026-12-05", 1)).toBe("2027-01-05");
    expect(shiftAnchor("month", "2027-01-05", -1)).toBe("2026-12-05");
  });

  it("moves a year forward and back", () => {
    expect(shiftAnchor("year", "2026-08-05", 1)).toBe("2027-08-05");
    expect(shiftAnchor("year", "2026-08-05", -1)).toBe("2025-08-05");
  });
});
