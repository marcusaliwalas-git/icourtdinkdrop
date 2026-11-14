import { describe, it, expect } from "vitest";
import { summarizeUtilization, utilPct, type UtilCell } from "@/lib/utilization";

const names = new Map([
  ["c1", "Court 1"],
  ["c2", "Court 2"],
]);

// Small helper so tests only specify what they care about.
function cell(p: Partial<UtilCell> & Pick<UtilCell, "courtId" | "weekday" | "hour" | "capacity" | "booked">): UtilCell {
  return { revenue: 0, peak: false, ...p };
}

describe("utilPct", () => {
  it("is booked ÷ capacity as a whole percent", () => {
    expect(utilPct(3, 4)).toBe(75);
    expect(utilPct(0, 10)).toBe(0);
  });
  it("returns 0 when there is no capacity (no divide-by-zero)", () => {
    expect(utilPct(0, 0)).toBe(0);
    expect(utilPct(5, 0)).toBe(0);
  });
  it("caps at 100", () => {
    expect(utilPct(12, 10)).toBe(100);
  });
});

describe("summarizeUtilization", () => {
  it("computes overall, per-court and per-weekday utilization and revenue", () => {
    const cells = [
      cell({ courtId: "c1", weekday: 1, hour: 6, capacity: 10, booked: 8, revenue: 80000 }),
      cell({ courtId: "c2", weekday: 1, hour: 6, capacity: 10, booked: 2, revenue: 20000 }),
    ];
    const s = summarizeUtilization(cells, names);
    expect(s.capacityHours).toBe(20);
    expect(s.bookedHours).toBe(10);
    expect(s.revenueCents).toBe(100000);
    expect(s.pct).toBe(50);
    expect(s.byCourt.map((c) => [c.label, c.pct, c.revenue])).toEqual([
      ["Court 1", 80, 80000],
      ["Court 2", 20, 20000],
    ]);
    expect(s.busiest?.label).toBe("Court 1");
    expect(s.quietest?.label).toBe("Court 2");
  });

  it("splits capacity, booked and revenue into peak vs off-peak buckets", () => {
    const cells = [
      cell({ courtId: "c1", weekday: 1, hour: 18, capacity: 4, booked: 4, revenue: 60000, peak: true }),
      cell({ courtId: "c1", weekday: 1, hour: 7, capacity: 4, booked: 1, revenue: 10000, peak: false }),
    ];
    const s = summarizeUtilization(cells, names);
    expect(s.peak).toEqual({ capacity: 4, booked: 4, revenue: 60000, pct: 100 });
    expect(s.offpeak).toEqual({ capacity: 4, booked: 1, revenue: 10000, pct: 25 });
  });

  it("orders the weekday breakdown Monday → Sunday", () => {
    const cells = [
      cell({ courtId: "c1", weekday: 0, hour: 6, capacity: 4, booked: 1 }),
      cell({ courtId: "c1", weekday: 1, hour: 6, capacity: 4, booked: 2 }),
      cell({ courtId: "c1", weekday: 6, hour: 6, capacity: 4, booked: 3 }),
    ];
    const s = summarizeUtilization(cells, names);
    expect(s.byWeekday.map((w) => w.label)).toEqual(["Monday", "Saturday", "Sunday"]);
  });

  it("builds a zero-filled heatmap and ranks best/worst open slots", () => {
    const cells = [
      cell({ courtId: "c1", weekday: 1, hour: 6, capacity: 2, booked: 2 }), // Mon 6am fully booked
      cell({ courtId: "c1", weekday: 3, hour: 8, capacity: 2, booked: 0 }), // Wed 8am empty
    ];
    const s = summarizeUtilization(cells, names);
    expect(s.minHour).toBe(6);
    expect(s.maxHour).toBe(9);
    expect(s.heatmap).toHaveLength(21); // 7 weekdays × 3 hours
    expect(s.bestSlots[0]).toMatchObject({ weekday: 1, hour: 6, pct: 100 });
    expect(s.worstSlots[0].pct).toBe(0); // an empty open cell is deadest
  });

  it("handles no open hours without crashing", () => {
    const s = summarizeUtilization([], names);
    expect(s.pct).toBe(0);
    expect(s.heatmap).toEqual([]);
    expect(s.busiest).toBeNull();
    expect(s.peak.capacity).toBe(0);
    expect(s.bestSlots).toEqual([]);
  });
});
