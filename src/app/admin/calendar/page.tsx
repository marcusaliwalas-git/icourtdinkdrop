import { createClient } from "@/lib/supabase/server";
import { buildAdminCalendarGrid } from "@/lib/availability";
import { formatInTimezone, startOfLocalDayUtc, endOfLocalDayUtc } from "@/lib/time";
import { CalendarGrid } from "./calendar-grid";

export const dynamic = "force-dynamic";

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: venue } = await supabase
    .from("venues")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

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

  const courtIds = (courts ?? []).map((c) => c.id);
  const dayStart = startOfLocalDayUtc(date, venue.timezone);
  const dayEnd = endOfLocalDayUtc(date, venue.timezone);

  const [{ data: dayHours }, { data: bookings }, { data: closures }] = await Promise.all([
    supabase
      .from("operating_hours")
      .select("open_time, close_time")
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
  ]);

  const grid = buildAdminCalendarGrid({
    date,
    timezone: venue.timezone,
    slotMinutes: 30,
    courts: courts ?? [],
    dayHours: dayHours ?? [],
    bookings: (bookings ?? []) as never,
    closures: closures ?? [],
  });

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
        <div className="flex gap-2">
          <a href={hrefFor(addDays(-1))} className="rounded-md border px-3 py-1.5 text-sm">
            ← Prev
          </a>
          <a href={hrefFor(today)} className="rounded-md border px-3 py-1.5 text-sm">
            Today
          </a>
          <a href={hrefFor(addDays(1))} className="rounded-md border px-3 py-1.5 text-sm">
            Next →
          </a>
          <a href={`/admin/bookings/export?from=${date}&to=${date}`} className="rounded-md border px-3 py-1.5 text-sm">
            Export day CSV
          </a>
        </div>
      </div>

      {grid.closedAllDay ? (
        <p className="text-muted-foreground">No operating hours set for this day.</p>
      ) : (
        <CalendarGrid timezone={venue.timezone} courts={courts ?? []} rows={grid.rows} />
      )}
    </div>
  );
}
