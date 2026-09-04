import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buildAvailabilityGrid } from "@/lib/availability";
import { formatInTimezone, startOfLocalDayUtc, endOfLocalDayUtc, nextLocalDate } from "@/lib/time";
import { AvailabilityGrid } from "./availability-grid";
import { DatePickerPopover } from "./date-picker-popover";
import { getTenant } from "@/lib/tenant";
import { featureEnabled } from "@/lib/features";

export const dynamic = "force-dynamic";

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextSaturday(fromDateStr: string): string {
  const d = new Date(`${fromDateStr}T12:00:00Z`);
  const day = d.getUTCDay();
  const daysUntilSat = (6 - day + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilSat);
  return d.toISOString().slice(0, 10);
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // The tenant (venue) comes from the request hostname, not a query param.
  const venue = await getTenant();

  if (!venue) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No venue is set up yet. Check back soon.
      </div>
    );
  }

  const today = formatInTimezone(new Date(), "yyyy-MM-dd", venue.timezone);
  const date = params.date ?? today;
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: courts } = await supabase
    .from("courts")
    .select("id, name, hourly_rate_cents, member_rate_cents")
    .eq("venue_id", venue.id)
    .eq("is_active", true)
    .order("name");

  // Coaching is a per-venue capability; when it's off, offer no coaches so the booking sheet hides
  // the add-on entirely.
  const { data: coaches } = featureEnabled(venue?.features, "coaches")
    ? await supabase
        .from("coaches")
        .select("id, name, hourly_rate_cents")
        .eq("venue_id", venue.id)
        .eq("is_active", true)
        .order("sort_order")
        .order("name")
    : { data: [] as { id: string; name: string; hourly_rate_cents: number }[] };

  const courtIds = (courts ?? []).map((c) => c.id);
  const dayStart = startOfLocalDayUtc(date, venue.timezone);
  // Reach into the next calendar day so an overnight session's early-morning slots (rendered on
  // this day's grid) still see their booked slots and closures.
  const dayEnd = endOfLocalDayUtc(nextLocalDate(date), venue.timezone);

  const { data: ratePeriods } = courtIds.length
    ? await supabase.from("court_rate_periods").select("*").in("court_id", courtIds)
    : { data: [] as { court_id: string; start_time: string; end_time: string; hourly_rate_cents: number; member_rate_cents: number | null }[] };

  const ratePeriodsByCourtId: Record<string, NonNullable<typeof ratePeriods>> = {};
  for (const period of ratePeriods ?? []) {
    (ratePeriodsByCourtId[period.court_id] ??= []).push(period);
  }

  const [{ data: dayHours }, { data: bookedSlots }, { data: closures }, { data: paymentAccounts }] = await Promise.all([
    supabase
      .from("operating_hours")
      .select("open_time, close_time, closes_next_day")
      .eq("venue_id", venue.id)
      .eq("day_of_week", dayOfWeek),
    courtIds.length
      ? supabase
          .from("booking_slots")
          .select("court_id, time_range")
          .in("court_id", courtIds)
          .filter("time_range", "ov", `[${dayStart.toISOString()},${dayEnd.toISOString()})`)
      : Promise.resolve({ data: [] as { court_id: string; time_range: string }[] }),
    supabase
      .from("closures")
      .select("court_id, starts_at, ends_at")
      .eq("venue_id", venue.id)
      .lt("starts_at", dayEnd.toISOString())
      .gt("ends_at", dayStart.toISOString()),
    supabase
      .from("payment_accounts")
      .select("bank_name, account_name, account_number, remarks")
      .eq("venue_id", venue.id)
      .order("sort_order"),
  ]);

  const grid = buildAvailabilityGrid({
    date,
    timezone: venue.timezone,
    // Whole-hour rows, matching the whole-hour booking durations (see booking-durations.ts).
    // The row loop starts at the venue's configured open_time (see buildAvailabilityGrid), so
    // this also naturally anchors to whatever hours the admin set up, not a fixed clock grid.
    slotMinutes: 60,
    courts: courts ?? [],
    dayHours: dayHours ?? [],
    bookedSlots: bookedSlots ?? [],
    closures: closures ?? [],
  });

  const quickDates = {
    today,
    tomorrow: addDays(today, 1),
    weekend: nextSaturday(today),
  };

  function hrefFor(d: string) {
    const qs = new URLSearchParams({ date: d });
    return `/book?${qs.toString()}`;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">{venue.name}</h1>
        <p className="text-sm text-muted-foreground">{formatInTimezone(new Date(`${date}T12:00:00Z`), "EEEE, MMMM d", venue.timezone)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <QuickFilterLink href={hrefFor(quickDates.today)} active={date === quickDates.today}>
          Today
        </QuickFilterLink>
        <QuickFilterLink href={hrefFor(quickDates.tomorrow)} active={date === quickDates.tomorrow}>
          Tomorrow
        </QuickFilterLink>
        <QuickFilterLink href={hrefFor(quickDates.weekend)} active={date === quickDates.weekend}>
          This weekend
        </QuickFilterLink>
        <DatePickerPopover date={date} venueId={undefined} />
      </div>

      {grid.closedAllDay ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          The venue has no operating hours set for this day.
        </p>
      ) : (courts ?? []).length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">No courts available yet.</p>
      ) : (
        <AvailabilityGrid
          timezone={venue.timezone}
          courts={courts ?? []}
          rows={grid.rows}
          courtIds={courtIds}
          ratePeriodsByCourtId={ratePeriodsByCourtId}
          coaches={coaches ?? []}
          paymentAccounts={paymentAccounts ?? []}
          isLoggedIn={!!user}
        />
      )}

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/bookings" className="underline underline-offset-2">
          View my bookings
        </Link>
      </p>
    </div>
  );
}

function QuickFilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-sm ${
        active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
