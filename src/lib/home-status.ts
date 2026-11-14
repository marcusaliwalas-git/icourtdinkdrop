import { toZonedTime } from "date-fns-tz";
import { parseTstzRange } from "@/lib/availability";

export type CourtLiveStatus = "open" | "booked" | "closed";

export interface CourtStatusRow {
  id: string;
  name: string;
  isIndoor: boolean;
  status: CourtLiveStatus;
}

export interface LiveStatusResult {
  isOpenNow: boolean;
  openCourtsCount: number;
  totalCourts: number;
  courts: CourtStatusRow[];
  /** Formatted local time the venue opens later today, e.g. "6:00 AM" — null if already past all of today's hours. */
  nextOpenLabel: string | null;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToLabel(total: number): string {
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

/** Live, real-data court status for the home page's status board — no decorative placeholders. */
type HoursRow = { open_time: string; close_time: string; closes_next_day?: boolean | null };

export function computeLiveStatus(params: {
  now: Date;
  timezone: string;
  dayHours: HoursRow[];
  /** Yesterday's hours, so an overnight session (e.g. closes 2 AM) still reads as open after
   * midnight — the early-morning tail belongs to the previous day's row. */
  prevDayHours?: HoursRow[];
  courts: { id: string; name: string; is_indoor: boolean }[];
  bookedSlots: { court_id: string; time_range: string }[];
}): LiveStatusResult {
  const { now, timezone, dayHours, prevDayHours = [], courts, bookedSlots } = params;

  const localNow = toZonedTime(now, timezone);
  const nowMinutes = localNow.getHours() * 60 + localNow.getMinutes();

  const hourWindows = dayHours.map((h) => ({
    open: timeToMinutes(h.open_time),
    // A row that closes the next day extends past midnight, so its close in "today" minutes is
    // 24h+; nowMinutes (< 1440) is always before it once open has passed.
    close: timeToMinutes(h.close_time) + (h.closes_next_day ? 1440 : 0),
  }));

  // Open now if inside one of today's windows, or still inside yesterday's overnight tail.
  const inTodayWindow = hourWindows.some((w) => w.open <= nowMinutes && nowMinutes < w.close);
  const inPrevOvernight = prevDayHours.some(
    (h) => h.closes_next_day && nowMinutes < timeToMinutes(h.close_time)
  );
  const isOpenNow = inTodayWindow || inPrevOvernight;

  let nextOpenLabel: string | null = null;
  if (!isOpenNow) {
    const upcoming = hourWindows.map((w) => w.open).filter((open) => open > nowMinutes);
    if (upcoming.length > 0) {
      nextOpenLabel = minutesToLabel(Math.min(...upcoming));
    }
  }

  const occupiedCourtIds = new Set(
    bookedSlots
      .filter((b) => {
        const { start, end } = parseTstzRange(b.time_range);
        return start <= now && now < end;
      })
      .map((b) => b.court_id)
  );

  const courtRows: CourtStatusRow[] = courts.map((c) => ({
    id: c.id,
    name: c.name,
    isIndoor: c.is_indoor,
    status: !isOpenNow ? "closed" : occupiedCourtIds.has(c.id) ? "booked" : "open",
  }));

  return {
    isOpenNow,
    openCourtsCount: courtRows.filter((c) => c.status === "open").length,
    totalCourts: courts.length,
    courts: courtRows,
    nextOpenLabel,
  };
}
