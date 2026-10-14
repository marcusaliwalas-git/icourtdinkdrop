import { createClient } from "@/lib/supabase/server";
import { buildAdminCalendarGrid } from "@/lib/availability";
import { formatInTimezone, startOfLocalDayUtc, endOfLocalDayUtc, nextLocalDate } from "@/lib/time";
import { CalendarViews } from "./calendar-views";
import { CalendarDatePicker } from "./date-picker";
import { ShareAvailability } from "./share-availability";
import { getTenant } from "@/lib/tenant";
import { featureEnabled } from "@/lib/features";
import { compareCourtName } from "@/lib/courts";
import type { RatePeriod as CourtRatePeriod } from "@/lib/pricing";

export const dynamic = "force-dynamic";

/** "08:00:00" → "8 AM" (drops ":00"); keeps the minute when it isn't on the hour. */
function fmtClock(hhmmss: string): string {
  const [h, m] = hhmmss.split(":").map(Number);
  const dt = new Date(Date.UTC(2000, 0, 1, h, m || 0));
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", timeZone: "UTC" };
  if (m) opts.minute = "2-digit";
  return new Intl.DateTimeFormat("en-US", opts).format(dt);
}

function peso(cents: number): string {
  return "₱" + (cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const venue = await getTenant();

  if (!venue) {
    return <p className="text-muted-foreground">Set up your venue first.</p>;
  }

  const today = formatInTimezone(new Date(), "yyyy-MM-dd", venue.timezone);
  const date = params.date ?? today;
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();

  const { data: courts } = await supabase
    .from("courts")
    .select("id, name, hourly_rate_cents, member_rate_cents")
    .eq("venue_id", venue.id)
    .eq("is_active", true)
    .order("name");
  courts?.sort(compareCourtName); // natural order: Court 2 before Court 10

  // Active promotions so the walk-in sheets show the same discount the booking will record.
  const { data: promotions } = await supabase
    .from("promotions")
    .select("id, name, type, config, eligibility, stackable, priority, starts_on, ends_on")
    .eq("venue_id", venue.id)
    .eq("active", true);

  const courtIds = (courts ?? []).map((c) => c.id);
  const dayStart = startOfLocalDayUtc(date, venue.timezone);
  // Extend the booking/closure window into the next calendar day so an overnight session's
  // early-morning slots (which render on this day's grid) still pull their bookings.
  const dayEnd = endOfLocalDayUtc(nextLocalDate(date), venue.timezone);

  const [{ data: dayHours }, { data: bookings }, { data: closures }, { data: ratePeriods }] = await Promise.all([
    supabase
      .from("operating_hours")
      .select("open_time, close_time, closes_next_day")
      .eq("venue_id", venue.id)
      .eq("day_of_week", dayOfWeek),
    courtIds.length
      ? supabase
          .from("bookings")
          .select("id, court_id, time_range, guest_name, status, profiles(full_name)")
          .in("court_id", courtIds)
          .in("status", ["confirmed", "pending"])
          .filter("time_range", "ov", `[${dayStart.toISOString()},${dayEnd.toISOString()})`)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("closures")
      .select("court_id, starts_at, ends_at")
      .eq("venue_id", venue.id)
      .lt("starts_at", dayEnd.toISOString())
      .gt("ends_at", dayStart.toISOString()),
    courtIds.length
      ? supabase
          .from("court_rate_periods")
          .select("court_id, start_time, end_time, hourly_rate_cents, member_rate_cents, days_of_week")
          .in("court_id", courtIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  // Per-court pricing for the multi-select running total (walk-ins price at the non-member rate).
  const pricing: Record<string, { baseHourlyRateCents: number; ratePeriods: CourtRatePeriod[] }> = {};
  for (const c of courts ?? []) {
    pricing[c.id] = {
      baseHourlyRateCents: c.hourly_rate_cents,
      ratePeriods: (ratePeriods ?? [])
        .filter((p) => p.court_id === c.id)
        .map((p) => ({
          start_time: p.start_time,
          end_time: p.end_time,
          hourly_rate_cents: p.hourly_rate_cents,
          member_rate_cents: p.member_rate_cents,
          days_of_week: p.days_of_week,
        })),
    };
  }

  const grid = buildAdminCalendarGrid({
    date,
    timezone: venue.timezone,
    // Whole-hour rows, matching the whole-hour booking durations. Anchored to the venue's
    // configured open_time (the row loop starts there), so it follows the admin's hours setup.
    slotMinutes: 60,
    courts: courts ?? [],
    dayHours: dayHours ?? [],
    bookings: (bookings ?? []) as never,
    closures: closures ?? [],
  });

  // Rate summary for the shareable poster: the distinct time-of-day rate windows across courts, or a
  // flat rate per distinct base when no rate periods are configured.
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const periodMap = new Map<string, { start: string; end: string; cents: number }>();
  for (const c of courts ?? []) {
    for (const p of pricing[c.id].ratePeriods) {
      const k = `${p.start_time}|${p.end_time}|${p.hourly_rate_cents}`;
      if (!periodMap.has(k)) periodMap.set(k, { start: p.start_time, end: p.end_time, cents: p.hourly_rate_cents });
    }
  }
  const rateLines =
    periodMap.size > 0
      ? [...periodMap.values()]
          .sort((a, b) => toMin(a.start) - toMin(b.start))
          .map((p) => ({ label: `${fmtClock(p.start)} - ${fmtClock(p.end)}`, price: peso(p.cents) }))
      : [...new Set((courts ?? []).map((c) => c.hourly_rate_cents))]
          .sort((a, b) => a - b)
          .map((cents) => ({ label: "Rate", price: peso(cents) }));

  const venueRec = venue as unknown as { custom_domain?: string | null; slug?: string | null };
  const siteUrl = venueRec.custom_domain ?? (venueRec.slug ? `${venueRec.slug}.dinkdrop.live` : "");

  // Slim the grid down to what the poster needs: a status per court per hour.
  const posterRows = grid.rows.map((r) => ({
    startsAtIso: r.startsAtIso,
    cells: Object.fromEntries((courts ?? []).map((c) => [c.id, r.cells[c.id]?.status ?? "closed"])),
  }));

  function hrefFor(d: string) {
    return `/admin/calendar?date=${d}`;
  }

  function addDays(days: number): string {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {formatInTimezone(new Date(`${date}T12:00:00Z`), "EEEE, MMMM d", venue.timezone)}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <a href={hrefFor(addDays(-1))} className="rounded-md border px-3 py-1.5 text-sm">
            ← Prev
          </a>
          <a href={hrefFor(today)} className="rounded-md border px-3 py-1.5 text-sm">
            Today
          </a>
          <a href={hrefFor(addDays(1))} className="rounded-md border px-3 py-1.5 text-sm">
            Next →
          </a>
          <CalendarDatePicker date={date} />
          <a href={`/admin/bookings/export?from=${date}&to=${date}`} className="rounded-md border px-3 py-1.5 text-sm">
            Export day CSV
          </a>
          {!grid.closedAllDay && (
            <ShareAvailability
              venueName={venue.name}
              dateNumeric={formatInTimezone(new Date(`${date}T12:00:00Z`), "MM / dd / yyyy", venue.timezone)}
              weekday={formatInTimezone(new Date(`${date}T12:00:00Z`), "EEEE", venue.timezone)}
              courts={(courts ?? []).map((c) => ({ id: c.id, name: c.name }))}
              rows={posterRows}
              rateLines={rateLines}
              siteUrl={siteUrl}
              timezone={venue.timezone}
            />
          )}
        </div>
      </div>

      {grid.closedAllDay ? (
        <p className="text-muted-foreground">No operating hours set for this day.</p>
      ) : (
        <CalendarViews
          timezone={venue.timezone}
          courts={courts ?? []}
          rows={grid.rows}
          pricing={pricing}
          venueId={venue.id}
          equipmentEnabled={featureEnabled(venue.features, "equipment")}
          promotions={promotions ?? []}
          dateLabel={formatInTimezone(new Date(`${date}T12:00:00Z`), "EEEE, MMMM d", venue.timezone)}
          defaultView={venue.calendar_default_view ?? "grid"}
        />
      )}
    </div>
  );
}
