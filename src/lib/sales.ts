// Pure sales aggregation — no I/O, so the revenue rules live in one tested place. The page
// fetches bookings and precomputes each row's venue-local weekday, then hands them here.

import { isPaid } from "@/lib/payment-methods";

// A booking counts as realized revenue only once it's both locked in (confirmed / completed /
// no-show — under the venue's no-refund policy a no-show that paid keeps the money) *and* settled
// (isPaid). A confirmed walk-in still owed at the venue (pay_at_venue) is money not yet collected,
// so it's surfaced as "awaiting" — never in the realized total — until it's marked paid. 'pending'
// (online, awaiting verification) is likewise awaiting. 'cancelled' is excluded entirely.
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
  paymentMethod: string | null; // 'cash' | 'online' | 'complimentary' | null (not explicitly set)
  paymentStatus: string; // used to attribute a booking with no explicit method (e.g. online)
  bookedAsMember: boolean; // was the member rate applied at booking time
  /** The online deposit on a deposit booking; null/undefined = normal full-payment booking. Realized
   * revenue counts the deposit (paid online) plus the balance once it's collected. */
  depositCents?: number | null;
  /** How a deposit booking's balance was collected ('cash' | 'online'); null = not yet collected. */
  balancePaymentMethod?: string | null;
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
  /** Bookings not yet paid (pending online + confirmed-but-owed) — shown apart from realized revenue. */
  awaitingCents: number;
  awaitingCount: number;
  /** Deposit-booking balances already reserved but still to be collected at the venue. 0 for venues
   * without the deposit option. */
  outstandingCents: number;
  outstandingCount: number;
  byCourt: SalesBreakdown[];
  bySource: SalesBreakdown[];
  byWeekday: SalesBreakdown[];
  /** Realized revenue split by how it was paid (cash / GCash / bank transfer); bookings with no
   * recorded method — e.g. online slip payments — fall under "Not recorded". */
  byMethod: SalesBreakdown[];
  /** Realized revenue split by whether the member rate was applied at booking time. */
  byMembership: SalesBreakdown[];
}

const SOURCE_LABELS: Record<string, string> = {
  online: "Online",
  walkin: "Walk-in",
  admin: "Admin",
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  online: "Paid online",
};

/** Which "By payment method" bucket a realized booking belongs to. Prefer the explicitly recorded
 * method (Cash / Paid online); otherwise attribute by payment status so online customer bookings
 * (paid_online, no method) count as "Paid online" and in-person ones as "Paid at venue", rather
 * than all collapsing into "Not recorded". Only genuinely unknown rows stay "Not recorded". */
function paymentBucket(method: string | null, status: string): { key: string; label: string } {
  if (method) return { key: method, label: METHOD_LABELS[method] ?? method };
  if (status === "paid_online") return { key: "online", label: "Paid online" };
  if (status === "paid_at_venue") return { key: "paid_at_venue", label: "Paid at venue" };
  return { key: "unrecorded", label: "Not recorded" };
}

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
  // Complimentary (comped/free) bookings are settled but never revenue — excluded from realized
  // totals, counts, and every breakdown, so they don't appear on the sales tab at all. Unpaid
  // bookings (pay_at_venue / awaiting_verification) are likewise excluded from realized until
  // settled — a booking must be locked in *and* paid to count.
  const realized = rows.filter(
    (r) => REALIZED_STATUSES.includes(r.status) && r.paymentMethod !== "complimentary" && isPaid(r.paymentStatus)
  );
  // Money expected but not yet collected: pending online bookings plus confirmed/locked-in
  // bookings still owed at the venue. Complimentary is free, so it's never "awaiting".
  const awaiting = rows.filter(
    (r) =>
      r.paymentMethod !== "complimentary" &&
      (AWAITING_STATUSES.includes(r.status) ||
        (REALIZED_STATUSES.includes(r.status) && !isPaid(r.paymentStatus)))
  );

  // A deposit booking has collected its deposit (online) plus, once settled, the balance. Until the
  // balance is collected it's outstanding. Null deposit = a normal booking → just totalCents (numbers
  // unchanged for most venues). "Settled" = the balance method is recorded.
  const isDeposit = (r: SalesInputRow) => r.depositCents != null;
  const settled = (r: SalesInputRow) => !!r.balancePaymentMethod;
  const collected = (r: SalesInputRow) => (isDeposit(r) ? (settled(r) ? r.totalCents : r.depositCents!) : r.totalCents);

  const realizedCents = realized.reduce((sum, r) => sum + collected(r), 0);
  const bookingCount = realized.length;

  // Balances reserved (deposit paid) but still to be collected at the venue.
  const outstandingRows = realized.filter((r) => isDeposit(r) && !settled(r));
  const outstandingCents = outstandingRows.reduce((sum, r) => sum + (r.totalCents - (r.depositCents ?? 0)), 0);

  const byCourt = new Map<string, SalesBreakdown>();
  const bySource = new Map<string, SalesBreakdown>();
  const byWeekday = new Map<string, SalesBreakdown>();
  const byMethod = new Map<string, SalesBreakdown>();
  const byMembership = new Map<string, SalesBreakdown>();

  for (const r of realized) {
    const amt = collected(r);
    accumulate(byCourt, r.courtId, r.courtName, amt);
    accumulate(bySource, r.source, SOURCE_LABELS[r.source] ?? r.source, amt);
    accumulate(byWeekday, String(r.isoWeekday), WEEKDAY_LABELS[r.isoWeekday] ?? String(r.isoWeekday), amt);
    // By payment method: a deposit booking splits across channels — the deposit was paid online, and
    // the balance (once collected) by its own method (cash or online).
    if (isDeposit(r)) {
      accumulate(byMethod, "online", "Paid online", r.depositCents!);
      if (settled(r)) {
        const bb = paymentBucket(r.balancePaymentMethod!, "");
        accumulate(byMethod, bb.key, bb.label, r.totalCents - r.depositCents!);
      }
    } else {
      const bucket = paymentBucket(r.paymentMethod, r.paymentStatus);
      accumulate(byMethod, bucket.key, bucket.label, r.totalCents);
    }
    accumulate(byMembership, r.bookedAsMember ? "member" : "nonmember", r.bookedAsMember ? "Member" : "Non-member", amt);
  }

  return {
    realizedCents,
    bookingCount,
    avgCents: bookingCount ? Math.round(realizedCents / bookingCount) : 0,
    awaitingCents: awaiting.reduce((sum, r) => sum + collected(r), 0),
    awaitingCount: awaiting.length,
    outstandingCents,
    outstandingCount: outstandingRows.length,
    byCourt: [...byCourt.values()].sort((a, b) => b.cents - a.cents),
    bySource: [...bySource.values()].sort((a, b) => b.cents - a.cents),
    // Chronological Mon→Sun, not by revenue, so the week reads naturally.
    byWeekday: [...byWeekday.values()].sort((a, b) => Number(a.key) - Number(b.key)),
    byMethod: [...byMethod.values()].sort((a, b) => b.cents - a.cents),
    byMembership: [...byMembership.values()].sort((a, b) => b.cents - a.cents),
  };
}

/** Percentage change from a previous period's revenue to the current one. Returns null when
 * there's no prior baseline to compare against (avoids a meaningless "+∞%"). */
export function percentChange(currentCents: number, previousCents: number): number | null {
  if (previousCents === 0) return null;
  return Math.round(((currentCents - previousCents) / previousCents) * 100);
}
