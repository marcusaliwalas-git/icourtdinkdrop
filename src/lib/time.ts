import { toZonedTime, fromZonedTime, format as formatTz } from "date-fns-tz";

export const DEFAULT_TIMEZONE = "Asia/Manila";

/** Combines a local date ("2026-08-01") + time ("14:30") in `timezone` into a UTC Date. */
export function localDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string = DEFAULT_TIMEZONE
): Date {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, timezone);
}

/** Formats a UTC Date for display in `timezone`. Never build date strings by concatenation. */
export function formatInTimezone(
  date: Date,
  pattern: string,
  timezone: string = DEFAULT_TIMEZONE
): string {
  return formatTz(toZonedTime(date, timezone), pattern, { timeZone: timezone });
}

/** The calendar date one day after `dateStr` ("2026-08-30" → "2026-08-31"), date-only math. */
export function nextLocalDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function startOfLocalDayUtc(
  dateStr: string,
  timezone: string = DEFAULT_TIMEZONE
): Date {
  return fromZonedTime(`${dateStr}T00:00:00`, timezone);
}

export function endOfLocalDayUtc(
  dateStr: string,
  timezone: string = DEFAULT_TIMEZONE
): Date {
  return fromZonedTime(`${dateStr}T23:59:59.999`, timezone);
}
