export type CalendarPeriod = "week" | "month" | "year";

/**
 * The Monday-Sunday week, calendar month, or calendar year containing `anchorDateStr`
 * ("yyyy-MM-dd"), expressed as local calendar-date boundaries (not yet a timezone-aware UTC
 * instant — pair with startOfLocalDayUtc/endOfLocalDayUtc for that). Anchored at UTC noon and
 * manipulated via setUTC* so a DST transition in the *system* clock can't shift the calendar
 * day, mirroring the existing addDays pattern in admin/calendar/page.tsx.
 */
export function periodBounds(period: CalendarPeriod, anchorDateStr: string): { from: string; to: string } {
  const anchor = new Date(`${anchorDateStr}T12:00:00Z`);

  if (period === "week") {
    const day = anchor.getUTCDay(); // 0 = Sunday
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(anchor);
    monday.setUTCDate(monday.getUTCDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
  }

  if (period === "month") {
    const y = anchor.getUTCFullYear();
    const m = anchor.getUTCMonth();
    const first = new Date(Date.UTC(y, m, 1));
    const last = new Date(Date.UTC(y, m + 1, 0)); // day 0 of next month = last day of this one
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
  }

  const y = anchor.getUTCFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/** Shifts an anchor date by one period step, for Prev/Next navigation between weeks/months/years. */
export function shiftAnchor(period: CalendarPeriod, anchorDateStr: string, direction: 1 | -1): string {
  const d = new Date(`${anchorDateStr}T12:00:00Z`);
  if (period === "week") d.setUTCDate(d.getUTCDate() + 7 * direction);
  else if (period === "month") d.setUTCMonth(d.getUTCMonth() + direction);
  else d.setUTCFullYear(d.getUTCFullYear() + direction);
  return d.toISOString().slice(0, 10);
}
