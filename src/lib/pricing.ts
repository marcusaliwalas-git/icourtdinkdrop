import { toZonedTime } from "date-fns-tz";

export interface RatePeriod {
  start_time: string;
  end_time: string;
  hourly_rate_cents: number;
  member_rate_cents: number | null;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** The rate for a single hour starting at `localStartMinutes` (which may exceed 1440 for
 * an hour past local midnight — no period ever matches that, same as the server function).
 * Falls back to the court's flat base rate when no rate period covers the hour. Ties
 * between overlapping periods resolve to whichever starts latest (most specific window),
 * mirroring create_booking's ordering. */
export function rateForHour(params: {
  localStartMinutes: number;
  ratePeriods: RatePeriod[];
  baseHourlyRateCents: number;
  baseMemberRateCents: number | null;
  isMember: boolean;
}): number {
  const { localStartMinutes, ratePeriods, baseHourlyRateCents, baseMemberRateCents, isMember } = params;

  const matching = ratePeriods
    .filter((p) => {
      const start = timeToMinutes(p.start_time);
      const end = timeToMinutes(p.end_time);
      return start <= localStartMinutes && localStartMinutes < end;
    })
    .sort((a, b) => timeToMinutes(b.start_time) - timeToMinutes(a.start_time));

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
  const hours = durationMinutes / 60;

  let total = 0;
  for (let i = 0; i < hours; i++) {
    total += rateForHour({
      localStartMinutes: localStartMinutes + i * 60,
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
