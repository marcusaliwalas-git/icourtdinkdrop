// Pure sales aggregation — no I/O, so the revenue rules live in one tested place. The page
// fetches bookings and precomputes each row's venue-local weekday, then hands them here.

// A booking counts as realized revenue once it's locked in and the payment is kept: confirmed,
// completed, or no-show (under the venue's no-refund policy a no-show still paid and isn't
// refunded, so the money is real). 'pending' is money not yet verified — surfaced separately,
// never in the realized total. 'cancelled' is excluded entirely (nothing was paid / kept).
export const REALIZED_STATUSES = ["confirmed", "completed", "no_show"];
export const AWAITING_STATUSES = ["pending"];

// ISO weekday: 1 = Monday … 7 = Sunday (what date-fns' "i" token emits).
const WEEKDAY_LABELS: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export interface SalesInputRow {
  status: string;
  totalCents: number;
  source: string;
  courtId: string;
  courtName: string;
  isoWeekday: number; // 1=Mon … 7=Sun, in venue-local time
}

export interface SalesBreakdown {
  key: string;
  label: string;
  cents: number;
  count: number;
}

export interface SalesSummary {
  realizedCents: number;
  bookingCount: number;
  avgCents: number;
  /** Pending bookings whose payment isn't verified yet — shown apart from realized revenue. */
  awaitingCents: number;
  awaitingCount: number;
  byCourt: SalesBreakdown[];
  bySource: SalesBreakdown[];
  byWeekday: SalesBreakdown[];
}

const SOURCE_LABELS: Record<string, string> = {
  online: "Online",
  walkin: "Walk-in",
  admin: "Admin",
};

function accumulate(
  map: Map<string, SalesBreakdown>,
  key: string,
  label: string,
  cents: number
): void {
  const existing = map.get(key);
  if (existing) {
    existing.cents += cents;
    existing.count += 1;
  } else {
    map.set(key, { key, label, cents, count: 1 });
  }
}

export function summarizeSales(rows: SalesInputRow[]): SalesSummary {
  const realized = rows.filter((r) => REALIZED_STATUSES.includes(r.status));
  const awaiting = rows.filter((r) => AWAITING_STATUSES.includes(r.status));

  const realizedCents = realized.reduce((sum, r) => sum + r.totalCents, 0);
  const bookingCount = realized.length;

  const byCourt = new Map<string, SalesBreakdown>();
  const bySource = new Map<string, SalesBreakdown>();
  const byWeekday = new Map<string, SalesBreakdown>();

  for (const r of realized) {
    accumulate(byCourt, r.courtId, r.courtName, r.totalCents);
    accumulate(bySource, r.source, SOURCE_LABELS[r.source] ?? r.source, r.totalCents);
    accumulate(byWeekday, String(r.isoWeekday), WEEKDAY_LABELS[r.isoWeekday] ?? String(r.isoWeekday), r.totalCents);
  }

  return {
    realizedCents,
    bookingCount,
    avgCents: bookingCount ? Math.round(realizedCents / bookingCount) : 0,
    awaitingCents: awaiting.reduce((sum, r) => sum + r.totalCents, 0),
    awaitingCount: awaiting.length,
    byCourt: [...byCourt.values()].sort((a, b) => b.cents - a.cents),
    bySource: [...bySource.values()].sort((a, b) => b.cents - a.cents),
    // Chronological Mon→Sun, not by revenue, so the week reads naturally.
    byWeekday: [...byWeekday.values()].sort((a, b) => Number(a.key) - Number(b.key)),
  };
}

/** Percentage change from a previous period's revenue to the current one. Returns null when
 * there's no prior baseline to compare against (avoids a meaningless "+∞%"). */
export function percentChange(currentCents: number, previousCents: number): number | null {
  if (previousCents === 0) return null;
  return Math.round(((currentCents - previousCents) / previousCents) * 100);
}
