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
import { hourBundle } from "@/lib/promos/types/hour-bundle";

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

  it("minCourts 1 applies to any booking, even a single court", () => {
    const parsed = volumeDiscount.configSchema.parse({ minCourts: 1, centsOffPerHour: 30000 });
    const lines = volumeDiscount.apply(ctx([segment("a", 2, 100000)]), parsed, promo());
    expect(lines.map((l) => l.cents)).toEqual([60000]); // ₱300/hr × 2h
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

describe("volumeDiscount.apply with a time window", () => {
  const evening = { minCourts: 3, centsOffPerHour: 5000, windowStart: "18:00", windowEnd: "21:00" };
  // 18:00 Manila = 10:00 UTC; a 2h evening slot runs 18:00–20:00, inside 18:00–21:00.
  function segAt(courtId: string, startUtcIso: string, hours: number): PromoSegment {
    return { courtId, startsAtIso: startUtcIso, durationMinutes: hours * 60, baseTotalCents: 100000 };
  }
  const eve = (court: string) => segAt(court, "2026-10-05T10:00:00.000Z", 2); // 18:00 Manila
  const morning = (court: string) => segAt(court, "2026-10-05T01:00:00.000Z", 2); // 09:00 Manila

  it("discounts in-window slots once the threshold is met", () => {
    const lines = volumeDiscount.apply(ctx([eve("a"), eve("b"), eve("c")]), evening, promo());
    expect(lines.map((l) => l.cents)).toEqual([10000, 10000, 10000]);
  });

  it("ignores out-of-window slots when counting courts (below threshold → nothing)", () => {
    // 2 in window + 1 outside → only 2 eligible courts, min is 3.
    const lines = volumeDiscount.apply(ctx([eve("a"), eve("b"), morning("c")]), evening, promo());
    expect(lines).toEqual([]);
  });

  it("discounts only the in-window slots when the threshold is met by them", () => {
    const lines = volumeDiscount.apply(ctx([eve("a"), eve("b"), eve("c"), morning("d")]), evening, promo());
    expect(lines.map((l) => l.segmentIndex)).toEqual([0, 1, 2]); // the morning slot (index 3) is excluded
  });

  it("excludes a slot that runs past the window end", () => {
    // 20:00 Manila (12:00 UTC) for 2h ends 22:00 — not fully inside 18:00–21:00.
    const late = segAt("a", "2026-10-05T12:00:00.000Z", 2);
    const lines = volumeDiscount.apply(ctx([late, eve("b"), eve("c")]), evening, promo());
    expect(lines).toEqual([]); // only 2 in-window courts
  });

  it("supports an overnight window (end earlier than start, e.g. 05:00–02:00)", () => {
    const overnight = { minCourts: 2, centsOffPerHour: 5000, windowStart: "05:00", windowEnd: "02:00" };
    // 23:00 Manila = 15:00 UTC; a 2h slot runs 23:00–01:00, inside the 05:00→02:00 window.
    const night = (court: string) => segAt(court, "2026-10-05T15:00:00.000Z", 2);
    const lines = volumeDiscount.apply(ctx([night("a"), night("b")]), overnight, promo());
    expect(lines.map((l) => l.cents)).toEqual([10000, 10000]);
  });

  it("excludes slots in the overnight gap (02:00–05:00)", () => {
    const overnight = { minCourts: 2, centsOffPerHour: 5000, windowStart: "05:00", windowEnd: "02:00" };
    // 03:00 Manila = 19:00 UTC the previous day; 03:00–05:00 is outside 05:00→02:00.
    const gap = (court: string) => segAt(court, "2026-10-04T19:00:00.000Z", 2);
    const lines = volumeDiscount.apply(ctx([gap("a"), gap("b")]), overnight, promo());
    expect(lines).toEqual([]);
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

  it("supports an overnight window (e.g. 20:00–02:00)", () => {
    const overnight = { windowStart: "20:00", windowEnd: "02:00", minHours: 4, freeHours: 1 };
    // 22:00 Manila = 14:00 UTC; a 4h booking runs 22:00–02:00, exactly inside 20:00→02:00.
    const night = ctx([
      { courtId: "a", startsAtIso: "2026-10-05T14:00:00.000Z", durationMinutes: 240, baseTotalCents: 180000 },
    ]);
    const lines = freeHours.apply(night, overnight, fhPromo);
    expect(lines).toHaveLength(1);
    expect(lines[0].cents).toBe(45000);
  });

  it("skips a booking that runs past an overnight window's end", () => {
    const overnight = { windowStart: "20:00", windowEnd: "02:00", minHours: 4, freeHours: 1 };
    // 23:00 Manila = 15:00 UTC; a 4h booking runs 23:00–03:00, past the 02:00 end.
    const late = ctx([
      { courtId: "a", startsAtIso: "2026-10-05T15:00:00.000Z", durationMinutes: 240, baseTotalCents: 180000 },
    ]);
    expect(freeHours.apply(late, overnight, fhPromo)).toEqual([]);
  });
});

describe("hourBundle.apply", () => {
  // 16:00 Manila = 08:00 UTC. Base ₱450/hr.
  function seg(court: string, startUtcIso: string, hours: number): PromoSegment {
    return { courtId: court, startsAtIso: startUtcIso, durationMinutes: hours * 60, baseTotalCents: hours * 45000 };
  }
  const bundle = { windowStart: "16:00", windowEnd: "19:00", bundleHours: 3, bundlePriceCents: 100000 }; // 3h for ₱1,000
  const bPromo = promo({ type: "hour_bundle", name: "Evening block" });

  it("prices an exact 3-hour booking at the flat bundle price", () => {
    // base 3×₱450 = ₱1,350; discount brings it to ₱1,000.
    const lines = hourBundle.apply(ctx([seg("a", "2026-10-05T08:00:00.000Z", 3)]), bundle, bPromo);
    expect(lines).toHaveLength(1);
    expect(135000 - lines[0].cents).toBe(100000); // net total = ₱1,000
  });

  it("charges extra hours beyond the bundle at the normal rate", () => {
    // 4h booking, base ₱1,800. First 3h = ₱1,000, 4th hour = ₱450 → net ₱1,450.
    const lines = hourBundle.apply(ctx([seg("a", "2026-10-05T08:00:00.000Z", 4)]), bundle, bPromo);
    expect(180000 - lines[0].cents).toBe(145000);
  });

  it("skips a booking shorter than the bundle", () => {
    expect(hourBundle.apply(ctx([seg("a", "2026-10-05T08:00:00.000Z", 2)]), bundle, bPromo)).toEqual([]);
  });

  it("skips when the bundle block doesn't fit in the window", () => {
    // 17:00 start + 3h = 20:00, past the 19:00 window end.
    expect(hourBundle.apply(ctx([seg("a", "2026-10-05T09:00:00.000Z", 3)]), bundle, bPromo)).toEqual([]);
  });

  it("doesn't apply when it isn't a saving (block already cheaper than the bundle price)", () => {
    // A ₱300/hr court → 3h base ₱900, below the ₱1,000 bundle, so no discount.
    const cheap: PromoSegment = { courtId: "a", startsAtIso: "2026-10-05T08:00:00.000Z", durationMinutes: 180, baseTotalCents: 90000 };
    expect(hourBundle.apply(ctx([cheap]), bundle, bPromo)).toEqual([]);
  });

  it("is dynamic — a 4-hour ₱1,200 bundle lands at ₱1,200", () => {
    const b4 = { windowStart: "16:00", windowEnd: "20:00", bundleHours: 4, bundlePriceCents: 120000 };
    const lines = hourBundle.apply(ctx([seg("a", "2026-10-05T08:00:00.000Z", 4)]), b4, bPromo);
    expect(180000 - lines[0].cents).toBe(120000);
  });

  it("supports an overnight window", () => {
    // Window 22:00–01:00 (3h); a 22:00 (14:00 UTC) 3-hour booking qualifies.
    const night = { windowStart: "22:00", windowEnd: "01:00", bundleHours: 3, bundlePriceCents: 100000 };
    const lines = hourBundle.apply(ctx([seg("a", "2026-10-05T14:00:00.000Z", 3)]), night, bPromo);
    expect(lines).toHaveLength(1);
    expect(135000 - lines[0].cents).toBe(100000);
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
