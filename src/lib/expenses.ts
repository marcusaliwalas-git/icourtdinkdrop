// Expense categories and the pure aggregation behind the Expenses tracker + the Sales net-profit
// figures. No I/O here, so the math is unit-testable in one place (mirrors lib/sales.ts).

/** The fixed set of expense categories. Keep in sync with the check constraint on expenses.category. */
export const EXPENSE_CATEGORIES = [
  { key: "rent", label: "Rent" },
  { key: "utilities", label: "Utilities" },
  { key: "wages", label: "Wages" },
  { key: "maintenance", label: "Maintenance" },
  { key: "equipment", label: "Equipment" },
  { key: "sports_equipment", label: "Sports equipment" },
  { key: "supplies", label: "Supplies" },
  { key: "marketing", label: "Marketing" },
  { key: "permits_fees", label: "Permits & local business fees" },
  { key: "other", label: "Other" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["key"];

export const EXPENSE_CATEGORY_KEYS = EXPENSE_CATEGORIES.map((c) => c.key) as [ExpenseCategory, ...ExpenseCategory[]];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.label]));

/** Human label for a stored category (falls back to the raw value for anything unexpected). */
export function expenseCategoryLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return CATEGORY_LABELS[value] ?? value;
}

export interface ExpenseInputRow {
  amountCents: number;
  category: string;
}

export interface ExpenseBreakdown {
  key: string;
  label: string;
  cents: number;
  count: number;
}

export interface ExpenseSummary {
  totalCents: number;
  count: number;
  byCategory: ExpenseBreakdown[];
}

/** Total + per-category breakdown for a set of expenses (already scoped to a venue and date range
 * by the caller). Categories are sorted by amount, largest first. */
export function summarizeExpenses(rows: ExpenseInputRow[]): ExpenseSummary {
  const byCategory = new Map<string, ExpenseBreakdown>();
  let totalCents = 0;

  for (const r of rows) {
    totalCents += r.amountCents;
    const existing = byCategory.get(r.category);
    if (existing) {
      existing.cents += r.amountCents;
      existing.count += 1;
    } else {
      byCategory.set(r.category, {
        key: r.category,
        label: expenseCategoryLabel(r.category),
        cents: r.amountCents,
        count: 1,
      });
    }
  }

  return {
    totalCents,
    count: rows.length,
    byCategory: [...byCategory.values()].sort((a, b) => b.cents - a.cents),
  };
}

/** Net profit for a period: realized revenue minus total expenses. Can be negative (a loss). */
export function netProfitCents(realizedCents: number, totalExpensesCents: number): number {
  return realizedCents - totalExpensesCents;
}
