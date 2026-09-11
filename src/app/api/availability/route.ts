import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { buildAvailabilityGrid } from "@/lib/availability";
import { formatInTimezone, startOfLocalDayUtc, endOfLocalDayUtc, nextLocalDate } from "@/lib/time";

// Public, uncached availability feed for the DinkDrop marketplace to sync THIS venue's open court
// hours. No auth (DinkDrop fetches with no credentials), read-only, no side effects.
export const dynamic = "force-dynamic";

// Whole-hour slots, matching the app's whole-hour booking durations and the booking grid.
const SLOT_MINUTES = 60;

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/availability
 *
 * Per-tenant by design: the venue is resolved from the request host (getTenant), exactly like the
 * public booking page — so each venue's own domain publishes its own feed with no per-venue config.
 * This fork has no `available_slots` view / `availability_slots` table; open hours are computed on
 * the fly from operating_hours minus occupied booking_slots minus closures, in the future, via the
 * same buildAvailabilityGrid the booking page uses. booking_slots only holds active bookings
 * (pending/confirmed) — cancel/void/no-show remove the row — so a booked hour drops from the feed
 * automatically, and the past is excluded by the grid's `now` cutoff.
 *
 * Shape: { "slots": [ { "id": "<courtId>:<startIso>", "start": <ISO+offset>, "end": <ISO+offset> } ] }
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };

  const venue = await getTenant();
  // Don't publish availability for a host with no venue, or a disabled one.
  if (!venue || !venue.is_active) {
    return NextResponse.json({ slots: [] }, { headers });
  }

  const supabase = await createClient();
  const tz = venue.timezone;

  const { data: courts } = await supabase
    .from("courts")
    .select("id, name")
    .eq("venue_id", venue.id)
    .eq("is_active", true)
    .order("name");
  const courtIds = (courts ?? []).map((c) => c.id);
  if (courtIds.length === 0) {
    return NextResponse.json({ slots: [] }, { headers });
  }

  // Publish the bookable window: from today through the venue's max advance days.
  const today = formatInTimezone(new Date(), "yyyy-MM-dd", tz);
  const lastDay = addDays(today, venue.max_advance_days);
  const windowStart = startOfLocalDayUtc(today, tz);
  // Reach one calendar day past the last day so an overnight session's early-morning tail still
  // sees its occupancy/closures.
  const windowEnd = endOfLocalDayUtc(nextLocalDate(lastDay), tz);

  const [{ data: operatingHours }, { data: bookedSlots }, { data: closures }] = await Promise.all([
    supabase
      .from("operating_hours")
      .select("day_of_week, open_time, close_time, closes_next_day")
      .eq("venue_id", venue.id),
    supabase
      .from("booking_slots")
      .select("court_id, time_range")
      .in("court_id", courtIds)
      .filter("time_range", "ov", `[${windowStart.toISOString()},${windowEnd.toISOString()})`),
    supabase
      .from("closures")
      .select("court_id, starts_at, ends_at")
      .eq("venue_id", venue.id)
      .lt("starts_at", windowEnd.toISOString())
      .gt("ends_at", windowStart.toISOString()),
  ]);

  const now = new Date();
  // Dedupe by synthesized id — an overnight session's tail and the next day's own grid never
  // produce the same court+instant, but a Map keeps that guaranteed.
  const bySlotId = new Map<
    string,
    { id: string; start: string; end: string; court: string; courtName: string }
  >();

  for (let date = today; date <= lastDay; date = addDays(date, 1)) {
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
    const dayHours = (operatingHours ?? []).filter((h) => h.day_of_week === dayOfWeek);
    if (dayHours.length === 0) continue; // closed that weekday

    const grid = buildAvailabilityGrid({
      date,
      timezone: tz,
      slotMinutes: SLOT_MINUTES,
      courts: courts ?? [],
      dayHours,
      // The grid checks overlap per cell, so passing the whole window's rows/closures is safe.
      bookedSlots: bookedSlots ?? [],
      closures: closures ?? [],
      now,
    });

    for (const row of grid.rows) {
      // startsAtIso is an absolute instant serialized with a timezone offset (Z). Keep it as-is;
      // the end is exactly one slot later.
      const endIso = new Date(new Date(row.startsAtIso).getTime() + SLOT_MINUTES * 60_000).toISOString();
      for (const court of courts ?? []) {
        if (row.cells[court.id] !== "available") continue;
        const id = `${court.id}:${row.startsAtIso}`;
        // Additive per-court fields so DinkDrop can list courts separately. `court` is the real,
        // stable court id (same value the `id` is prefixed with); `courtName` is its display name.
        bySlotId.set(id, {
          id,
          start: row.startsAtIso,
          end: endIso,
          court: court.id,
          courtName: court.name ?? court.id,
        });
      }
    }
  }

  const slots = Array.from(bySlotId.values()).sort((a, b) => a.start.localeCompare(b.start));
  return NextResponse.json({ slots }, { headers });
}
