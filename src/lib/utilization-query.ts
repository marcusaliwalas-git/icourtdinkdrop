import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { parseTstzRange } from "./availability";
import { formatInTimezone, startOfLocalDayUtc, endOfLocalDayUtc, localDateTimeToUtc } from "./time";
import { rateForHour, type RatePeriod } from "./pricing";
import type { UtilCell } from "./utilization";

// Statuses that hold a court (and so count against open capacity). Cancelled/voided free the slot.
const OCCUPIED = ["pending", "confirmed", "completed", "no_show"];
const HOUR_MS = 3_600_000;

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat, matches operating_hours
}
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Build the per-(court, weekday, hour) utilization cells for a date range: capacity from operating
 * hours minus closures, booked hours + revenue from occupied bookings, and a peak flag per hour (the
 * effective list rate is above the court's cheapest rate). Shared by the report page and its CSV
 * export so the bucketing lives in one place.
 */
export async function computeUtilization(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  venueId: string;
  timezone: string;
  from: string;
  to: string;
  courtId?: string | null;
}): Promise<{ cells: UtilCell[]; courtNames: Map<string, string>; courtCount: number }> {
  const { supabase, venueId, timezone: tz, from, to, courtId } = params;
  const rangeStart = startOfLocalDayUtc(from, tz);
  const rangeEnd = endOfLocalDayUtc(to, tz);
  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();

  let courtQuery = supabase
    .from("courts")
    .select("id, name, hourly_rate_cents, member_rate_cents")
    .eq("venue_id", venueId)
    .eq("is_active", true);
  if (courtId) courtQuery = courtQuery.eq("id", courtId);

  const [{ data: courts }, { data: hours }, { data: closureRows }] = await Promise.all([
    courtQuery,
    supabase.from("operating_hours").select("day_of_week, open_time, close_time").eq("venue_id", venueId),
    supabase
      .from("closures")
      .select("court_id, starts_at, ends_at")
      .eq("venue_id", venueId)
      .lte("starts_at", rangeEnd.toISOString())
      .gte("ends_at", rangeStart.toISOString()),
  ]);

  const courtList = courts ?? [];
  const courtIds = courtList.map((c) => c.id);
  const courtNames = new Map(courtList.map((c) => [c.id, c.name]));

  const [{ data: periods }, { data: bookings }] = await Promise.all([
    supabase
      .from("court_rate_periods")
      .select("court_id, start_time, end_time, hourly_rate_cents, member_rate_cents, days_of_week")
      .in("court_id", courtIds),
    supabase
      .from("bookings")
      .select("court_id, time_range, status, total_cents, courts!inner(venue_id)")
      .eq("courts.venue_id", venueId)
      .in("status", OCCUPIED)
      .filter("time_range", "ov", `[${rangeStart.toISOString()},${rangeEnd.toISOString()})`)
      .limit(20000),
  ]);

  const ratesByCourt = new Map<string, RatePeriod[]>();
  for (const p of (periods ?? []) as unknown as ({ court_id: string } & RatePeriod)[]) {
    const list = ratesByCourt.get(p.court_id) ?? [];
    list.push({
      start_time: p.start_time,
      end_time: p.end_time,
      hourly_rate_cents: p.hourly_rate_cents,
      member_rate_cents: p.member_rate_cents,
      days_of_week: p.days_of_week,
    });
    ratesByCourt.set(p.court_id, list);
  }

  const openHoursByDow = new Map<number, Set<number>>();
  for (const h of hours ?? []) {
    const set = openHoursByDow.get(h.day_of_week) ?? new Set<number>();
    const lo = Math.floor(timeToMinutes(h.open_time) / 60);
    const hi = Math.ceil(timeToMinutes(h.close_time) / 60);
    for (let hr = lo; hr < hi; hr++) set.add(hr);
    openHoursByDow.set(h.day_of_week, set);
  }

  const closures = (closureRows ?? []).map((c) => ({
    courtId: c.court_id as string | null,
    startMs: new Date(c.starts_at).getTime(),
    endMs: new Date(c.ends_at).getTime(),
  }));

  // Capacity + the effective list rate for every open (court, weekday, hour). Rate is stored even for
  // closed hours so a court's cheapest-rate baseline reflects all its open hours.
  const capacity = new Map<string, number>();
  const effRate = new Map<string, number>();
  for (let d = from; d <= to; d = addDaysToDateStr(d, 1)) {
    const dow = weekdayOf(d);
    const openHours = openHoursByDow.get(dow);
    if (!openHours || openHours.size === 0) continue;
    for (const hr of openHours) {
      let hourStartMs = 0;
      let hourEndMs = 0;
      if (closures.length) {
        hourStartMs = localDateTimeToUtc(d, `${String(hr).padStart(2, "0")}:00`, tz).getTime();
        hourEndMs = hourStartMs + HOUR_MS;
      }
      for (const court of courtList) {
        const key = `${court.id}|${dow}|${hr}`;
        if (!effRate.has(key)) {
          effRate.set(
            key,
            rateForHour({
              localStartMinutes: hr * 60,
              dayOfWeek: dow,
              ratePeriods: ratesByCourt.get(court.id) ?? [],
              baseHourlyRateCents: court.hourly_rate_cents,
              baseMemberRateCents: court.member_rate_cents,
              isMember: false,
            })
          );
        }
        const closed =
          closures.length > 0 &&
          closures.some(
            (cl) => (cl.courtId === null || cl.courtId === court.id) && cl.startMs < hourEndMs && cl.endMs > hourStartMs
          );
        if (!closed) capacity.set(key, (capacity.get(key) ?? 0) + 1);
      }
    }
  }

  // Each court's cheapest open-hour rate — hours priced above it are "peak".
  const courtMinRate = new Map<string, number>();
  for (const [key, rate] of effRate) {
    const court = key.split("|")[0];
    const cur = courtMinRate.get(court);
    if (cur === undefined || rate < cur) courtMinRate.set(court, rate);
  }

  // Booked hours + revenue, each booking's total spread evenly across its hours.
  const booked = new Map<string, number>();
  const revenue = new Map<string, number>();
  for (const b of bookings ?? []) {
    const { start, end } = parseTstzRange(b.time_range as string);
    const fullHours = Math.max(1, Math.round((end.getTime() - start.getTime()) / HOUR_MS));
    const perHour = (b.total_cents ?? 0) / fullHours;
    let hs = Math.max(start.getTime(), rangeStartMs);
    const he = Math.min(end.getTime(), rangeEndMs);
    for (; hs < he; hs += HOUR_MS) {
      const local = formatInTimezone(new Date(hs), "yyyy-MM-dd'T'HH", tz);
      const dow = weekdayOf(local.slice(0, 10));
      const hr = Number(local.slice(11, 13));
      const key = `${b.court_id}|${dow}|${hr}`;
      booked.set(key, (booked.get(key) ?? 0) + 1);
      revenue.set(key, (revenue.get(key) ?? 0) + perHour);
    }
  }

  const cells: UtilCell[] = [...new Set([...capacity.keys(), ...booked.keys()])].map((key) => {
    const [cId, dow, hr] = key.split("|");
    const rate = effRate.get(key);
    const min = courtMinRate.get(cId);
    return {
      courtId: cId,
      weekday: Number(dow),
      hour: Number(hr),
      capacity: capacity.get(key) ?? 0,
      booked: booked.get(key) ?? 0,
      revenue: Math.round(revenue.get(key) ?? 0),
      peak: rate !== undefined && min !== undefined && rate > min,
    };
  });

  return { cells, courtNames, courtCount: courtList.length };
}
