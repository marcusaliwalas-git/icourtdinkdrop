import { describe, it, expect } from "vitest";
import {
  evaluatePromotions,
  resolveStacking,
  eligibilityMatches,
  withinWindow,
  totalDiscountCents,
  type PromoRow,
  type PromoContext,
  type PromoSegment,
} from "@/lib/promos/engine";
import { volumeDiscount } from "@/lib/promos/types/volume-discount";
import { freeHours } from "@/lib/promos/types/free-hours";

const TZ = "Asia/Manila";

function segment(courtId: string, hours: number, baseCents: number): PromoSegment {
  return {
    courtId,
    startsAtIso: "2026-10-05T01:00:00.000Z", // 9am Manila
    durationMinutes: hours * 60,
    baseTotalCents: baseCents,
  };
}

function ctx(segments: PromoSegment[], overrides: Partial<PromoContext> = {}): PromoContext {
  return { venueId: "v1", timezone: TZ, isMember: false, onDateIso: "2026-10-05", segments, ...overrides };
}

function promo(overrides: Partial<PromoRow> = {}): PromoRow {
  return {
    id: "p1",
    name: "Multi-court discount",
    type: "volume_discount",
    config: { minCourts: 3, centsOffPerHour: 5000 },
    eligibility: "all",
    stackable: false,
    priority: 0,
    startsOn: null,
    endsOn: null,
    ...overrides,
  };
}

describe("volumeDiscount.apply", () => {
  it("gives no discount below the court threshold", () => {
    const c = ctx([segment("a", 2, 100000), segment("b", 2, 100000)]); // 2 distinct courts, min 3
    expect(volumeDiscount.apply(c, { minCourts: 3, centsOffPerHour: 5000 }, promo())).toEqual([]);
  });

  it("discounts every slot ₱/hr once the threshold is met", () => {
    const c = ctx([segment("a", 2, 100000), segment("b", 1, 100000), segment("c", 3, 100000)]);
    const lines = volumeDiscount.apply(c, { minCourts: 3, centsOffPerHour: 5000 }, promo());
    // 5000/hr: 2h→10000, 1h→5000, 3h→15000
    expect(lines.map((l) => l.cents)).toEqual([10000, 5000, 15000]);
    expect(lines.every((l) => l.promotionId === "p1" && l.label === "Multi-court discount")).toBe(true);
  });

  it("counts distinct courts — the same court twice is one court", () => {
    const c = ctx([segment("a", 1, 100000), segment("a", 1, 100000)]); // same court, 2 slots
    expect(volumeDiscount.apply(c, { minCourts: 2, centsOffPerHour: 5000 }, promo())).toEqual([]);
  });

  it("rounds odd durations to the nearest cent", () => {
    const c = ctx([segment("a", 1, 100000), segment("b", 1, 100000), segment("c", 1, 100000)]);
    // 90-minute slot at 5000/hr = 7500
    c.segments[0].durationMinutes = 90;
    const lines = volumeDiscount.apply(c, { minCourts: 3, centsOffPerHour: 5000 }, promo());
    expect(lines[0].cents).toBe(7500);
  });
});

describe("freeHours.apply", () => {
  // Default test segment starts 01:00Z = 09:00 Asia/Manila (UTC+8), so a 4h booking runs 09:00–13:00.
  const cfg = { windowStart: "08:00", windowEnd: "16:00", minHours: 4, freeHours: 1 };
  const fhPromo = promo({ type: "free_hours", name: "Daytime deal" });

  it("takes one hour's average rate off a qualifying daytime booking", () => {
    // 4h, base ₱1,800 → 1 free hour = ₱450
    const lines = freeHours.apply(ctx([segment("a", 4, 180000)]), cfg, fhPromo);
    expect(lines).toHaveLength(1);
    expect(lines[0].cents).toBe(45000);
    expect(lines[0].label).toBe("Daytime deal");
  });

  it("skips a booking below the hours threshold", () => {
    expect(freeHours.apply(ctx([segment("a", 3, 135000)]), cfg, fhPromo)).toEqual([]);
  });

  it("skips a booking that runs past the window", () => {
    // 06:00Z = 14:00 Manila, 4h → ends 18:00, past the 16:00 window end.
    const late = ctx([
      { courtId: "a", startsAtIso: "2026-10-05T06:00:00.000Z", durationMinutes: 240, baseTotalCents: 180000 },
    ]);
    expect(freeHours.apply(late, cfg, fhPromo)).toEqual([]);
  });

  it("applies per court-slot (each qualifying booking gets its free hour)", () => {
    const lines = freeHours.apply(ctx([segment("a", 4, 180000), segment("b", 4, 200000)]), cfg, fhPromo);
    expect(lines.map((l) => l.cents)).toEqual([45000, 50000]);
  });
});

describe("evaluatePromotions", () => {
  it("caps a line to its segment base (never negative price)", () => {
    const c = ctx([segment("a", 2, 3000), segment("b", 2, 100000), segment("c", 2, 100000)]);
    // 5000/hr × 2h = 10000, but segment a's base is only 3000 → capped to 3000.
    const lines = evaluatePromotions(c, [promo()]);
    expect(lines.find((l) => l.segmentIndex === 0)!.cents).toBe(3000);
  });

  it("skips promos outside their schedule window", () => {
    const c = ctx([segment("a", 1, 100000), segment("b", 1, 100000), segment("c", 1, 100000)]);
    const future = promo({ startsOn: "2026-12-01", endsOn: "2026-12-31" });
    expect(evaluatePromotions(c, [future])).toEqual([]);
  });

  it("skips a members_only promo for a guest and applies it for a member", () => {
    const segs = [segment("a", 1, 100000), segment("b", 1, 100000), segment("c", 1, 100000)];
    const membersOnly = promo({ eligibility: "members_only" });
    expect(evaluatePromotions(ctx(segs, { isMember: false }), [membersOnly])).toEqual([]);
    expect(totalDiscountCents(evaluatePromotions(ctx(segs, { isMember: true }), [membersOnly]))).toBe(15000);
  });

  it("ignores unknown promo types", () => {
    const c = ctx([segment("a", 1, 100000), segment("b", 1, 100000), segment("c", 1, 100000)]);
    expect(evaluatePromotions(c, [promo({ type: "not_a_real_type" })])).toEqual([]);
  });
});

describe("resolveStacking", () => {
  const line = (cents: number) => ({ segmentIndex: 0, cents, promotionId: "x", label: "x" });

  it("sums stackable promos", () => {
    const out = resolveStacking([
      { promo: promo({ id: "s1", stackable: true }), lines: [line(1000)] },
      { promo: promo({ id: "s2", stackable: true }), lines: [line(2000)] },
    ]);
    expect(totalDiscountCents(out)).toBe(3000);
  });

  it("picks the single best exclusive over a smaller stackable set", () => {
    const out = resolveStacking([
      { promo: promo({ id: "excl", stackable: false }), lines: [line(5000)] },
      { promo: promo({ id: "s1", stackable: true }), lines: [line(2000)] },
    ]);
    expect(totalDiscountCents(out)).toBe(5000); // exclusive 5000 > stackable 2000
  });

  it("prefers the stackable set when it beats the best exclusive", () => {
    const out = resolveStacking([
      { promo: promo({ id: "excl", stackable: false }), lines: [line(3000)] },
      { promo: promo({ id: "s1", stackable: true }), lines: [line(2000)] },
      { promo: promo({ id: "s2", stackable: true }), lines: [line(2500)] },
    ]);
    expect(totalDiscountCents(out)).toBe(4500); // 2000 + 2500 > 3000
  });

  it("breaks exclusive ties by priority", () => {
    const tagged = (cents: number, promotionId: string) => ({ segmentIndex: 0, cents, promotionId, label: "x" });
    const out = resolveStacking([
      { promo: promo({ id: "low", stackable: false, priority: 0 }), lines: [tagged(3000, "low")] },
      { promo: promo({ id: "high", stackable: false, priority: 9 }), lines: [tagged(3000, "high")] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].promotionId).toBe("high"); // equal discount → higher priority wins
  });
});

describe("eligibilityMatches", () => {
  it("handles all / members_only / guests_only", () => {
    expect(eligibilityMatches(promo({ eligibility: "all" }), false)).toBe(true);
    expect(eligibilityMatches(promo({ eligibility: "members_only" }), true)).toBe(true);
    expect(eligibilityMatches(promo({ eligibility: "members_only" }), false)).toBe(false);
    expect(eligibilityMatches(promo({ eligibility: "guests_only" }), false)).toBe(true);
    expect(eligibilityMatches(promo({ eligibility: "guests_only" }), true)).toBe(false);
  });
});

describe("withinWindow", () => {
  it("respects start and end bounds (inclusive)", () => {
    expect(withinWindow("2026-10-05", null, null)).toBe(true);
    expect(withinWindow("2026-10-05", "2026-10-05", "2026-10-05")).toBe(true);
    expect(withinWindow("2026-10-04", "2026-10-05", null)).toBe(false);
    expect(withinWindow("2026-10-06", null, "2026-10-05")).toBe(false);
  });
});
