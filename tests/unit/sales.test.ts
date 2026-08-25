import { describe, it, expect } from "vitest";
import { summarizeSales, percentChange, type SalesInputRow } from "@/lib/sales";

function row(overrides: Partial<SalesInputRow>): SalesInputRow {
  return {
    status: "confirmed",
    totalCents: 50000,
    source: "online",
    courtId: "court-1",
    courtName: "Court 1",
    isoWeekday: 1,
    ...overrides,
  };
}

describe("summarizeSales", () => {
  it("counts confirmed, completed, and no-show as realized revenue; excludes cancelled", () => {
    const s = summarizeSales([
      row({ status: "confirmed", totalCents: 50000 }),
      row({ status: "completed", totalCents: 60000 }),
      row({ status: "no_show", totalCents: 40000 }),
      row({ status: "cancelled", totalCents: 99999 }),
    ]);
    expect(s.realizedCents).toBe(150000);
    expect(s.bookingCount).toBe(3);
    expect(s.avgCents).toBe(50000);
  });

  it("surfaces pending bookings separately, never in realized revenue", () => {
    const s = summarizeSales([
      row({ status: "confirmed", totalCents: 50000 }),
      row({ status: "pending", totalCents: 30000 }),
      row({ status: "pending", totalCents: 20000 }),
    ]);
    expect(s.realizedCents).toBe(50000);
    expect(s.awaitingCents).toBe(50000);
    expect(s.awaitingCount).toBe(2);
  });

  it("breaks realized revenue down by court, sorted by revenue", () => {
    const s = summarizeSales([
      row({ courtId: "c1", courtName: "Court 1", totalCents: 40000 }),
      row({ courtId: "c2", courtName: "Court 2", totalCents: 90000 }),
      row({ courtId: "c1", courtName: "Court 1", totalCents: 40000 }),
      row({ status: "cancelled", courtId: "c2", courtName: "Court 2", totalCents: 99999 }),
    ]);
    expect(s.byCourt).toEqual([
      { key: "c2", label: "Court 2", cents: 90000, count: 1 },
      { key: "c1", label: "Court 1", cents: 80000, count: 2 },
    ]);
  });

  it("breaks down by source with friendly labels", () => {
    const s = summarizeSales([
      row({ source: "online", totalCents: 50000 }),
      row({ source: "walkin", totalCents: 30000 }),
      row({ source: "walkin", totalCents: 30000 }),
    ]);
    expect(s.bySource).toEqual([
      { key: "walkin", label: "Walk-in", cents: 60000, count: 2 },
      { key: "online", label: "Online", cents: 50000, count: 1 },
    ]);
  });

  it("orders the weekday breakdown Monday→Sunday, not by revenue", () => {
    const s = summarizeSales([
      row({ isoWeekday: 7, totalCents: 90000 }), // Sunday, highest revenue
      row({ isoWeekday: 1, totalCents: 10000 }), // Monday
    ]);
    expect(s.byWeekday.map((b) => b.label)).toEqual(["Monday", "Sunday"]);
  });

  it("returns zeroed totals for an empty range without dividing by zero", () => {
    const s = summarizeSales([]);
    expect(s.realizedCents).toBe(0);
    expect(s.bookingCount).toBe(0);
    expect(s.avgCents).toBe(0);
    expect(s.byCourt).toEqual([]);
  });
});

describe("percentChange", () => {
  it("computes the change against a prior baseline", () => {
    expect(percentChange(150000, 100000)).toBe(50);
    expect(percentChange(80000, 100000)).toBe(-20);
  });

  it("returns null when there's no prior revenue to compare against", () => {
    expect(percentChange(100000, 0)).toBeNull();
  });
});
