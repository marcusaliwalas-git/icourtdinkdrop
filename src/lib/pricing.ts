import { toZonedTime } from "date-fns-tz";

export interface RatePeriod {
  start_time: string;
  end_time: string;
  hourly_rate_cents: number;
  member_rate_cents: number | null;
  // Weekdays this period applies to (0 = Sunday … 6 = Saturday), matching Postgres' `extract(dow)`
  // and JS `Date.getDay()`. null or empty means every day. Optional so callers that select only the
  // time columns (e.g. the homepage price range) keep working — a missing value means every day.
  days_of_week?: number[] | null;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Whether a rate period is scoped to specific weekdays (vs. applying every day). */
function isDayScoped(p: RatePeriod): boolean {
  return p.days_of_week != null && p.days_of_week.length > 0;
}

/** The rate for a single hour starting at `localStartMinutes` (which may exceed 1440 for
 * an hour past local midnight — no period ever matches that, same as the server function),
 * on weekday `dayOfWeek` (0 = Sunday … 6 = Saturday). Falls back to the court's flat base rate
 * when no rate period covers the hour. Ties resolve to a day-scoped period over an all-days one,
 * then to whichever starts latest (most specific window), mirroring create_booking's ordering.
 * `dayOfWeek` may be omitted, in which case only the time-of-day windows are considered. */
export function rateForHour(params: {
  localStartMinutes: number;
  dayOfWeek?: number;
  ratePeriods: RatePeriod[];
  baseHourlyRateCents: number;
  baseMemberRateCents: number | null;
  isMember: boolean;
}): number {
  const { localStartMinutes, dayOfWeek, ratePeriods, baseHourlyRateCents, baseMemberRateCents, isMember } = params;

  const matching = ratePeriods
    .filter((p) => {
      const start = timeToMinutes(p.start_time);
      const end = timeToMinutes(p.end_time);
      if (!(start <= localStartMinutes && localStartMinutes < end)) return false;
      // A day-scoped period only applies on its listed weekdays; all-days periods always apply.
      if (dayOfWeek != null && isDayScoped(p) && !p.days_of_week!.includes(dayOfWeek)) return false;
      return true;
    })
    .sort(
      (a, b) =>
        Number(isDayScoped(b)) - Number(isDayScoped(a)) || timeToMinutes(b.start_time) - timeToMinutes(a.start_time)
    );

  const period = matching[0];
  if (period) {
    return isMember && period.member_rate_cents != null ? period.member_rate_cents : period.hourly_rate_cents;
  }
  return isMember && baseMemberRateCents != null ? baseMemberRateCents : baseHourlyRateCents;
}

/** Total price for a whole-hour booking, summing each hour's applicable rate. Mirrors the
 * create_booking Postgres function's per-hour pricing exactly, so the estimate shown before
 * submitting always matches what the server actually charges. */
export function computeBookingTotalCents(params: {
  startsAtIso: string;
  durationMinutes: number;
  timezone: string;
  ratePeriods: RatePeriod[];
  baseHourlyRateCents: number;
  baseMemberRateCents: number | null;
  isMember: boolean;
}): number {
  const { startsAtIso, durationMinutes, timezone, ratePeriods, baseHourlyRateCents, baseMemberRateCents, isMember } =
    params;
  const localStart = toZonedTime(new Date(startsAtIso), timezone);
  const localStartMinutes = localStart.getHours() * 60 + localStart.getMinutes();
  // The booking is priced against the weekday it starts on — every hour uses this one weekday,
  // matching create_booking (which computes v_day_of_week once from the start).
  const dayOfWeek = localStart.getDay();
  const hours = durationMinutes / 60;

  let total = 0;
  for (let i = 0; i < hours; i++) {
    total += rateForHour({
      localStartMinutes: localStartMinutes + i * 60,
      dayOfWeek,
      ratePeriods,
      baseHourlyRateCents,
      baseMemberRateCents,
      isMember,
    });
  }
  return total;
}

/** Every distinct hourly rate a court could charge across the day (base rate + all rate
 * period rates) — for showing an accurate price range rather than just the flat base rate. */
export function allRatesCents(params: {
  baseHourlyRateCents: number;
  baseMemberRateCents: number | null;
  ratePeriods: RatePeriod[];
  isMember: boolean;
}): number[] {
  const { baseHourlyRateCents, baseMemberRateCents, ratePeriods, isMember } = params;
  const rates = [isMember && baseMemberRateCents != null ? baseMemberRateCents : baseHourlyRateCents];
  for (const p of ratePeriods) {
    rates.push(isMember && p.member_rate_cents != null ? p.member_rate_cents : p.hourly_rate_cents);
  }
  return rates;
}
