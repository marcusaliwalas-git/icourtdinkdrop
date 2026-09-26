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
    paymentMethod: null,
    paymentStatus: "paid_at_venue",
    bookedAsMember: false,
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

  it("excludes confirmed-but-unpaid bookings from realized revenue, surfacing them as awaiting", () => {
    const s = summarizeSales([
      row({ status: "confirmed", paymentStatus: "paid_at_venue", totalCents: 50000 }), // paid → realized
      row({ status: "confirmed", paymentStatus: "pay_at_venue", totalCents: 30000 }), // unpaid walk-in
      row({ status: "no_show", paymentStatus: "pay_at_venue", totalCents: 20000 }), // locked in but never paid
    ]);
    expect(s.realizedCents).toBe(50000);
    expect(s.bookingCount).toBe(1);
    expect(s.awaitingCents).toBe(50000);
    expect(s.awaitingCount).toBe(2);
    // The unpaid rows must not leak into any breakdown either.
    expect(s.byCourt.reduce((sum, b) => sum + b.cents, 0)).toBe(50000);
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

  it("attributes revenue by method, falling back to payment status for online/venue", () => {
    const s = summarizeSales([
      row({ paymentMethod: "cash", paymentStatus: "paid_at_venue", totalCents: 30000 }),
      row({ paymentMethod: "cash", paymentStatus: "paid_at_venue", totalCents: 20000 }),
      row({ paymentMethod: "online", paymentStatus: "paid_online", totalCents: 40000 }),
      // Online customer booking: no explicit method, but paid_online → counts as "Paid online".
      row({ paymentMethod: null, paymentStatus: "paid_online", totalCents: 15000 }),
      // Pre-feature in-person booking: no method, settled at venue → "Paid at venue".
      row({ paymentMethod: null, paymentStatus: "paid_at_venue", totalCents: 5000 }),
      row({ status: "cancelled", paymentMethod: "cash", paymentStatus: "paid_at_venue", totalCents: 99999 }),
    ]);
    expect(s.byMethod).toEqual([
      { key: "online", label: "Paid online", cents: 55000, count: 2 },
      { key: "cash", label: "Cash", cents: 50000, count: 2 },
      { key: "paid_at_venue", label: "Paid at venue", cents: 5000, count: 1 },
    ]);
  });

  it("excludes complimentary (free) bookings from revenue, count, and every breakdown", () => {
    const s = summarizeSales([
      row({ paymentMethod: "cash", totalCents: 50000 }),
      row({ paymentMethod: "complimentary", totalCents: 50000 }),
      row({ paymentMethod: "complimentary", totalCents: 30000 }),
    ]);
    expect(s.realizedCents).toBe(50000);
    expect(s.bookingCount).toBe(1);
    expect(s.byMethod).toEqual([{ key: "cash", label: "Cash", cents: 50000, count: 1 }]);
    expect(s.byMethod.some((b) => b.key === "complimentary")).toBe(false);
  });

  it("splits realized revenue by membership (member vs non-member)", () => {
    const s = summarizeSales([
      row({ bookedAsMember: true, totalCents: 30000 }),
      row({ bookedAsMember: true, totalCents: 20000 }),
      row({ bookedAsMember: false, totalCents: 90000 }),
      row({ status: "cancelled", bookedAsMember: true, totalCents: 99999 }),
    ]);
    expect(s.byMembership).toEqual([
      { key: "nonmember", label: "Non-member", cents: 90000, count: 1 },
      { key: "member", label: "Member", cents: 50000, count: 2 },
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
