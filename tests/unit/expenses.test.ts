import { describe, it, expect } from "vitest";
import { summarizeExpenses, netProfitCents, expenseCategoryLabel } from "@/lib/expenses";

describe("summarizeExpenses", () => {
  it("totals and counts, and breaks down by category sorted by amount", () => {
    const s = summarizeExpenses([
      { amountCents: 300000, category: "rent" },
      { amountCents: 50000, category: "utilities" },
      { amountCents: 20000, category: "utilities" },
      { amountCents: 15000, category: "sports_equipment" },
    ]);
    expect(s.totalCents).toBe(385000);
    expect(s.count).toBe(4);
    expect(s.byCategory).toEqual([
      { key: "rent", label: "Rent", cents: 300000, count: 1 },
      { key: "utilities", label: "Utilities", cents: 70000, count: 2 },
      { key: "sports_equipment", label: "Sports equipment", cents: 15000, count: 1 },
    ]);
  });

  it("handles an empty range", () => {
    const s = summarizeExpenses([]);
    expect(s).toEqual({ totalCents: 0, count: 0, byCategory: [] });
  });
});

describe("netProfitCents", () => {
  it("subtracts expenses from realized revenue", () => {
    expect(netProfitCents(500000, 385000)).toBe(115000);
  });

  it("can be negative (a loss)", () => {
    expect(netProfitCents(100000, 385000)).toBe(-285000);
  });
});

describe("expenseCategoryLabel", () => {
  it("labels known categories and the new ones", () => {
    expect(expenseCategoryLabel("permits_fees")).toBe("Permits & local business fees");
    expect(expenseCategoryLabel("sports_equipment")).toBe("Sports equipment");
  });
  it("falls back to the raw value and handles null", () => {
    expect(expenseCategoryLabel("mystery")).toBe("mystery");
    expect(expenseCategoryLabel(null)).toBe("—");
  });
});
