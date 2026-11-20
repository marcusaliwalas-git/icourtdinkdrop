import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { featureEnabled } from "@/lib/features";
import { formatInTimezone } from "@/lib/time";
import { toCsv } from "@/lib/csv";
import { computeUtilization } from "@/lib/utilization-query";
import { utilPct, WEEKDAY_LABELS } from "@/lib/utilization";

export const dynamic = "force-dynamic";

function hourLabel(h: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${ampm}`;
}

export async function GET(request: Request) {
  await requireAdmin();
  const venue = await getTenant();
  if (!venue || !featureEnabled(venue.features, "analytics")) {
    return new Response("Not found", { status: 404 });
  }

  const tz = venue.timezone;
  const today = formatInTimezone(new Date(), "yyyy-MM-dd", tz);
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? today;
  const to = searchParams.get("to") ?? today;
  const court = searchParams.get("court");

  const supabase = await createClient();
  const { cells, courtNames } = await computeUtilization({
    supabase,
    venueId: venue.id,
    timezone: tz,
    from,
    to,
    courtId: court,
  });

  // One row per cell that was open or booked, ordered by court → weekday → hour.
  const rows = cells
    .filter((c) => c.capacity > 0 || c.booked > 0)
    .sort(
      (a, b) =>
        (courtNames.get(a.courtId) ?? "").localeCompare(courtNames.get(b.courtId) ?? "") ||
        a.weekday - b.weekday ||
        a.hour - b.hour
    )
    .map((c) => [
      courtNames.get(c.courtId) ?? "Court",
      WEEKDAY_LABELS[c.weekday],
      hourLabel(c.hour),
      c.peak ? "Peak" : "Off-peak",
      c.capacity,
      c.booked,
      `${utilPct(c.booked, c.capacity)}%`,
      (c.revenue / 100).toFixed(2),
    ]);

  const csv = toCsv(
    ["Court", "Day", "Hour", "Pricing", "Open hours", "Booked hours", "Utilization", "Revenue (PHP)"],
    rows
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="utilization_${from}_to_${to}.csv"`,
    },
  });
}
