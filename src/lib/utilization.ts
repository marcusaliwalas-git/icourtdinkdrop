// Court utilization — how much of the open court-hours were actually booked, in whole-hour cells.
// Pure aggregation, no I/O: the query layer (utilization-query.ts) does the timezone-dependent
// bucketing — open hours, closures, each booking's local hours, its revenue, and whether the hour is
// priced as peak — and hands this module a flat list of per-(court, weekday, hour) cells, each already
// summed over every date in the range. Keeping the rollups here means one tested place for the
// percentages, the per-court / per-weekday splits, the peak vs off-peak buckets, the best/worst slots,
// and the heatmap matrix.
//
// Model: whole-hour slots (matching the booking grid). Weekday is 0=Sunday … 6=Saturday, the same
// convention as operating_hours.day_of_week. "Booked" counts the statuses that hold a court
// (pending / confirmed / completed / no_show); capacity is operating hours minus closures.

export interface UtilCell {
  courtId: string;
  weekday: number; // 0=Sun … 6=Sat
  hour: number; // 0–23, venue-local hour of day
  capacity: number; // open court-hours available in this cell, across the whole range
  booked: number; // booked court-hours in this cell, across the whole range
  revenue: number; // booked revenue (cents) attributed to this cell
  peak: boolean; // whether this hour is priced above the court's cheapest rate
}

export interface UtilBreakdown {
  key: string;
  label: string;
  capacity: number;
  booked: number;
  revenue: number;
  pct: number; // 0–100
}

export interface HeatCell {
  weekday: number; // 0=Sun … 6=Sat
  hour: number;
  capacity: number;
  booked: number;
  revenue: number;
  pct: number; // occupancy, 0–100
}

export interface BucketStat {
  capacity: number;
  booked: number;
  revenue: number;
  pct: number; // 0–100
}

export interface SlotStat {
  weekday: number;
  hour: number;
  capacity: number;
  booked: number;
  revenue: number;
  pct: number; // 0–100
}

export interface UtilizationSummary {
  capacityHours: number;
  bookedHours: number;
  revenueCents: number;
  pct: number; // overall, 0–100
  byCourt: UtilBreakdown[]; // busiest first
  byWeekday: UtilBreakdown[]; // Monday → Sunday
  heatmap: HeatCell[]; // every weekday × hour in [minHour, maxHour); 0-capacity cells included
  minHour: number; // first open hour (for the heatmap axis); 0 when there are no open hours
  maxHour: number; // exclusive
  busiest: UtilBreakdown | null;
  quietest: UtilBreakdown | null;
  peak: BucketStat; // hours priced above the court's cheapest rate
  offpeak: BucketStat; // the court's base / cheapest hours
  bestSlots: SlotStat[]; // up to 5 fullest weekday × hour cells
  worstSlots: SlotStat[]; // up to 5 emptiest open weekday × hour cells
}

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Display order: start the week on Monday, as the Sales report's weekday breakdown does.
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** booked ÷ capacity as a whole percent, capped at 100 (a cell can't be more than fully booked). */
export function utilPct(booked: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round((booked / capacity) * 100));
}

export function summarizeUtilization(cells: UtilCell[], courtNames: Map<string, string>): UtilizationSummary {
  let capacityHours = 0;
  let bookedHours = 0;
  let revenueCents = 0;
  const byCourt = new Map<string, { capacity: number; booked: number; revenue: number }>();
  const byWeekday = new Map<number, { capacity: number; booked: number; revenue: number }>();
  const heat = new Map<string, { capacity: number; booked: number; revenue: number }>();
  const bucket = { peak: { capacity: 0, booked: 0, revenue: 0 }, offpeak: { capacity: 0, booked: 0, revenue: 0 } };
  let minHour = Infinity;
  let maxHour = -Infinity;

  for (const c of cells) {
    capacityHours += c.capacity;
    bookedHours += c.booked;
    revenueCents += c.revenue;

    const bc = byCourt.get(c.courtId) ?? { capacity: 0, booked: 0, revenue: 0 };
    bc.capacity += c.capacity;
    bc.booked += c.booked;
    bc.revenue += c.revenue;
    byCourt.set(c.courtId, bc);

    const bw = byWeekday.get(c.weekday) ?? { capacity: 0, booked: 0, revenue: 0 };
    bw.capacity += c.capacity;
    bw.booked += c.booked;
    bw.revenue += c.revenue;
    byWeekday.set(c.weekday, bw);

    const hk = `${c.weekday}|${c.hour}`;
    const h = heat.get(hk) ?? { capacity: 0, booked: 0, revenue: 0 };
    h.capacity += c.capacity;
    h.booked += c.booked;
    h.revenue += c.revenue;
    heat.set(hk, h);

    const b = c.peak ? bucket.peak : bucket.offpeak;
    b.capacity += c.capacity;
    b.booked += c.booked;
    b.revenue += c.revenue;

    if (c.capacity > 0) {
      if (c.hour < minHour) minHour = c.hour;
      if (c.hour + 1 > maxHour) maxHour = c.hour + 1;
    }
  }

  const courtRows: UtilBreakdown[] = [...byCourt.entries()]
    .map(([id, v]) => ({ key: id, label: courtNames.get(id) ?? "Court", ...v, pct: utilPct(v.booked, v.capacity) }))
    .sort((a, b) => b.booked - a.booked);

  const weekdayRows: UtilBreakdown[] = WEEKDAY_ORDER.filter((d) => byWeekday.has(d)).map((d) => {
    const v = byWeekday.get(d)!;
    return { key: String(d), label: WEEKDAY_LABELS[d], ...v, pct: utilPct(v.booked, v.capacity) };
  });

  const hasHours = minHour !== Infinity;
  const loHour = hasHours ? minHour : 0;
  const hiHour = hasHours ? maxHour : 0;

  const heatmap: HeatCell[] = [];
  if (hasHours) {
    for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
      for (let hour = loHour; hour < hiHour; hour++) {
        const v = heat.get(`${weekday}|${hour}`) ?? { capacity: 0, booked: 0, revenue: 0 };
        heatmap.push({ weekday, hour, ...v, pct: utilPct(v.booked, v.capacity) });
      }
    }
  }

  const withCapacity = courtRows.filter((c) => c.capacity > 0);
  const busiest = withCapacity.length ? withCapacity.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const quietest = withCapacity.length ? withCapacity.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;

  // Best / worst weekday × hour slots — from the aggregated heatmap cells that are actually open.
  const openSlots = heatmap.filter((c) => c.capacity > 0);
  const bestSlots = [...openSlots].sort((a, b) => b.pct - a.pct || b.booked - a.booked).slice(0, 5);
  const worstSlots = [...openSlots].sort((a, b) => a.pct - b.pct || a.booked - b.booked).slice(0, 5);

  const toBucket = (b: { capacity: number; booked: number; revenue: number }): BucketStat => ({
    ...b,
    pct: utilPct(b.booked, b.capacity),
  });

  return {
    capacityHours,
    bookedHours,
    revenueCents,
    pct: utilPct(bookedHours, capacityHours),
    byCourt: courtRows,
    byWeekday: weekdayRows,
    heatmap,
    minHour: loHour,
    maxHour: hiHour,
    busiest,
    quietest,
    peak: toBucket(bucket.peak),
    offpeak: toBucket(bucket.offpeak),
    bestSlots,
    worstSlots,
  };
}
