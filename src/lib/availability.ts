import { localDateTimeToUtc, formatInTimezone, nextLocalDate } from "@/lib/time";

export type SlotStatus = "available" | "booked" | "closed" | "past";

export interface CourtSummary {
  id: string;
  name: string;
}

export interface TimeRow {
  startsAtIso: string;
  label: string;
  /** True for a slot that falls after midnight — the tail of an overnight session, on the next
   * calendar date. Lets the UI flag it so a 1:00 AM row isn't mistaken for the same day. */
  nextDay: boolean;
  cells: Record<string, SlotStatus>; // courtId -> status
}

export interface GridResult {
  rows: TimeRow[];
  closedAllDay: boolean;
}

interface RangeLike {
  start: Date;
  end: Date;
}

/** Parses a Postgres tstzrange as returned by PostgREST, e.g. `["2026-08-01T10:00:00+00:00","2026-08-01T11:00:00+00:00")`. */
export function parseTstzRange(raw: string): RangeLike {
  const inner = raw.slice(1, -1);
  const [startStr, endStr] = inner.split(",").map((s) => s.replace(/^"|"$/g, ""));
  return { start: new Date(startStr), end: new Date(endStr) };
}

function overlaps(aStart: Date, aEnd: Date, b: RangeLike): boolean {
  return aStart < b.end && b.start < aEnd;
}

type DayHour = { open_time: string; close_time: string; closes_next_day?: boolean | null };

/** Minutes past the open day's midnight that the day's session closes — adds 24h for a row that
 * spills past midnight, so an overnight session (e.g. 18:00 → 02:00) reads as 1080 → 1560. */
function effectiveCloseMinutes(dayHours: DayHour[]): number {
  return Math.max(...dayHours.map((h) => timeToMinutes(h.close_time) + (h.closes_next_day ? 1440 : 0)));
}

/** The UTC start of the slot `m` minutes past the open day's midnight. Minutes ≥ 1440 belong to
 * the next calendar date (the early-morning tail of an overnight session). */
function slotStart(date: string, m: number, timezone: string): Date {
  const onNextDay = m >= 1440;
  const localDate = onNextDay ? nextLocalDate(date) : date;
  return localDateTimeToUtc(localDate, minutesToTime(m - (onNextDay ? 1440 : 0)), timezone);
}

export function buildAvailabilityGrid(params: {
  date: string;
  timezone: string;
  slotMinutes: number;
  courts: CourtSummary[];
  dayHours: DayHour[];
  bookedSlots: { court_id: string; time_range: string }[];
  closures: { court_id: string | null; starts_at: string; ends_at: string }[];
  now?: Date;
}): GridResult {
  const { date, timezone, slotMinutes, courts, dayHours, bookedSlots, closures } = params;
  const now = params.now ?? new Date();

  if (dayHours.length === 0) {
    return { rows: [], closedAllDay: true };
  }

  const openMinutes = Math.min(...dayHours.map((h) => timeToMinutes(h.open_time)));
  const closeMinutes = effectiveCloseMinutes(dayHours);

  const bookedRanges = bookedSlots.map((b) => ({
    courtId: b.court_id,
    range: parseTstzRange(b.time_range),
  }));
  const closureRanges = closures.map((c) => ({
    courtId: c.court_id,
    range: { start: new Date(c.starts_at), end: new Date(c.ends_at) },
  }));

  const rows: TimeRow[] = [];
  for (let m = openMinutes; m + slotMinutes <= closeMinutes; m += slotMinutes) {
    const startsAt = slotStart(date, m, timezone);
    const endsAt = new Date(startsAt.getTime() + slotMinutes * 60_000);

    const cells: Record<string, SlotStatus> = {};
    for (const court of courts) {
      if (startsAt < now) {
        cells[court.id] = "past";
        continue;
      }
      const isClosed = closureRanges.some(
        (c) => (c.courtId === null || c.courtId === court.id) && overlaps(startsAt, endsAt, c.range)
      );
      if (isClosed) {
        cells[court.id] = "closed";
        continue;
      }
      const isBooked = bookedRanges.some(
        (b) => b.courtId === court.id && overlaps(startsAt, endsAt, b.range)
      );
      cells[court.id] = isBooked ? "booked" : "available";
    }

    rows.push({
      startsAtIso: startsAt.toISOString(),
      label: formatInTimezone(startsAt, "h:mm a", timezone),
      nextDay: m >= 1440,
      cells,
    });
  }

  return { rows, closedAllDay: false };
}

export interface AdminCell {
  status: SlotStatus;
  bookingId?: string;
  label?: string;
  bookingStatus?: string;
}

export interface AdminTimeRow {
  startsAtIso: string;
  label: string;
  nextDay: boolean;
  cells: Record<string, AdminCell>;
}

/** Same shape as buildAvailabilityGrid but carries booking identity/labels for the admin calendar. */
export function buildAdminCalendarGrid(params: {
  date: string;
  timezone: string;
  slotMinutes: number;
  courts: CourtSummary[];
  dayHours: DayHour[];
  bookings: {
    id: string;
    court_id: string;
    time_range: string;
    status: string;
    guest_name: string | null;
    profiles: { full_name: string | null } | null;
  }[];
  closures: { court_id: string | null; starts_at: string; ends_at: string }[];
  now?: Date;
}): { rows: AdminTimeRow[]; closedAllDay: boolean } {
  const { date, timezone, slotMinutes, courts, dayHours, bookings, closures } = params;
  const now = params.now ?? new Date();

  if (dayHours.length === 0) {
    return { rows: [], closedAllDay: true };
  }

  const openMinutes = Math.min(...dayHours.map((h) => timeToMinutes(h.open_time)));
  const closeMinutes = effectiveCloseMinutes(dayHours);

  const bookingRanges = bookings.map((b) => ({
    id: b.id,
    courtId: b.court_id,
    label: b.profiles?.full_name ?? b.guest_name ?? "Booked",
    status: b.status,
    range: parseTstzRange(b.time_range),
  }));
  const closureRanges = closures.map((c) => ({
    courtId: c.court_id,
    range: { start: new Date(c.starts_at), end: new Date(c.ends_at) },
  }));

  const rows: AdminTimeRow[] = [];
  for (let m = openMinutes; m + slotMinutes <= closeMinutes; m += slotMinutes) {
    const startsAt = slotStart(date, m, timezone);
    const endsAt = new Date(startsAt.getTime() + slotMinutes * 60_000);

    const cells: Record<string, AdminCell> = {};
    for (const court of courts) {
      const booking = bookingRanges.find((b) => b.courtId === court.id && overlaps(startsAt, endsAt, b.range));
      if (booking) {
        cells[court.id] = {
          status: "booked",
          bookingId: booking.id,
          label: booking.label,
          bookingStatus: booking.status,
        };
        continue;
      }
      const closure = closureRanges.find(
        (c) => (c.courtId === null || c.courtId === court.id) && overlaps(startsAt, endsAt, c.range)
      );
      if (closure) {
        cells[court.id] = { status: "closed" };
        continue;
      }
      cells[court.id] = { status: startsAt < now ? "past" : "available" };
    }

    rows.push({
      startsAtIso: startsAt.toISOString(),
      label: formatInTimezone(startsAt, "h:mm a", timezone),
      nextDay: m >= 1440,
      cells,
    });
  }

  return { rows, closedAllDay: false };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const m = (total % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
