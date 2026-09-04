import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatInTimezone, startOfLocalDayUtc, endOfLocalDayUtc } from "@/lib/time";
import { parseTstzRange } from "@/lib/availability";
import { periodBounds, shiftAnchor, type CalendarPeriod } from "@/lib/period-range";
import { summarizeSales, percentChange, type SalesInputRow, type SalesBreakdown } from "@/lib/sales";
import { getTenant } from "@/lib/tenant";
import { featureEnabled } from "@/lib/features";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const PERIOD_OPTIONS: { value: CalendarPeriod | "custom"; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom range" },
];

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// Days actually elapsed in a range, capped at today — so an in-progress month/year averages over
// the days that have happened, not the full calendar span (which would understate it).
function effectiveDays(from: string, to: string, today: string): number {
  const end = to < today ? to : today;
  if (end < from) return 1; // range hasn't started yet
  return daysBetween(from, end) + 1;
}

function avgDailyCents(realizedCents: number, from: string, to: string, today: string): number {
  return Math.round(realizedCents / effectiveDays(from, to, today));
}

interface SummaryResult {
  summary: ReturnType<typeof summarizeSales>;
  totalBookings: number;
}

async function summarizeRange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  venueId: string,
  timezone: string,
  from: string,
  to: string
): Promise<SummaryResult> {
  const rangeStart = startOfLocalDayUtc(from, timezone);
  const rangeEnd = endOfLocalDayUtc(to, timezone);

  // Scope to this venue via the court's venue_id (courts!inner makes the filter narrow the
  // bookings). RLS alone isn't enough here — an admin of several venues would otherwise see every
  // venue's sales pooled together on whichever host they're on.
  const { data: bookings } = await supabase
    .from("bookings")
    .select("status, total_cents, source, court_id, time_range, courts!inner(name, venue_id)")
    .eq("courts.venue_id", venueId)
    .filter("time_range", "ov", `[${rangeStart.toISOString()},${rangeEnd.toISOString()}]`)
    .limit(10000);

  const rows: SalesInputRow[] = (bookings ?? []).map((b) => {
    const { start } = parseTstzRange(b.time_range);
    return {
      status: b.status,
      totalCents: b.total_cents,
      source: b.source,
      courtId: b.court_id,
      courtName: (b.courts as unknown as { name: string } | null)?.name ?? "—",
      isoWeekday: Number(formatInTimezone(start, "i", timezone)),
    };
  });

  return { summary: summarizeSales(rows), totalBookings: rows.length };
}

export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; anchor?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const venue = await getTenant();

  if (!venue) {
    return <p className="text-muted-foreground">Set up your venue first.</p>;
  }
  if (!featureEnabled(venue.features, "analytics")) notFound();

  const period: CalendarPeriod | "custom" = PERIOD_OPTIONS.some((p) => p.value === params.period)
    ? (params.period as CalendarPeriod | "custom")
    : "month";
  const today = formatInTimezone(new Date(), "yyyy-MM-dd", venue.timezone);
  const anchor = params.anchor ?? today;

  const { from, to } =
    period === "custom"
      ? { from: params.from ?? today, to: params.to ?? today }
      : periodBounds(period, anchor);

  // Previous comparable window: the prior calendar week/month/year, or (for a custom range)
  // an equal-length window ending the day before it starts.
  const prev =
    period === "custom"
      ? (() => {
          const span = daysBetween(from, to);
          const prevTo = addDaysToDateStr(from, -1);
          return { from: addDaysToDateStr(prevTo, -span), to: prevTo };
        })()
      : periodBounds(period, shiftAnchor(period, anchor, -1));

  // Fixed month/year windows (independent of the selected period) for the always-on trends panel.
  const monthNow = periodBounds("month", today);
  const monthPrev = periodBounds("month", shiftAnchor("month", today, -1));
  const yearNow = periodBounds("year", today);
  const yearPrev = periodBounds("year", shiftAnchor("year", today, -1));

  const [current, previous, mNow, mPrev, yNow, yPrev] = await Promise.all([
    summarizeRange(supabase, venue.id, venue.timezone, from, to),
    summarizeRange(supabase, venue.id, venue.timezone, prev.from, prev.to),
    summarizeRange(supabase, venue.id, venue.timezone, monthNow.from, monthNow.to),
    summarizeRange(supabase, venue.id, venue.timezone, monthPrev.from, monthPrev.to),
    summarizeRange(supabase, venue.id, venue.timezone, yearNow.from, yearNow.to),
    summarizeRange(supabase, venue.id, venue.timezone, yearPrev.from, yearPrev.to),
  ]);

  const s = current.summary;
  const change = percentChange(s.realizedCents, previous.summary.realizedCents);

  // Avg daily sales for the selected range, and vs the previous comparable window.
  const avgDaily = avgDailyCents(s.realizedCents, from, to, today);
  const avgDailyPrev = avgDailyCents(previous.summary.realizedCents, prev.from, prev.to, today);
  const avgDailyChange = percentChange(avgDaily, avgDailyPrev);

  // Month-over-month and year-over-year avg daily sales, always relative to today.
  const momCurrent = avgDailyCents(mNow.summary.realizedCents, monthNow.from, monthNow.to, today);
  const momPrevious = avgDailyCents(mPrev.summary.realizedCents, monthPrev.from, monthPrev.to, today);
  const yoyCurrent = avgDailyCents(yNow.summary.realizedCents, yearNow.from, yearNow.to, today);
  const yoyPrevious = avgDailyCents(yPrev.summary.realizedCents, yearPrev.from, yearPrev.to, today);

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged = { period, anchor, from, to, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) next.set(k, v);
    }
    return `/admin/sales?${next.toString()}`;
  }

  const rangeLabel =
    from === to
      ? formatInTimezone(new Date(`${from}T12:00:00Z`), "MMM d, yyyy", venue.timezone)
      : `${formatInTimezone(new Date(`${from}T12:00:00Z`), "MMM d, yyyy", venue.timezone)} – ${formatInTimezone(
          new Date(`${to}T12:00:00Z`),
          "MMM d, yyyy",
          venue.timezone
        )}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Sales</p>
        <h1 className="mt-1 text-2xl font-bold">Revenue</h1>
      </div>

      {/* Period picker — same controls as Top Customers. */}
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((p) => (
            <Link
              key={p.value}
              href={hrefFor({ period: p.value, anchor: today, from: undefined, to: undefined })}
              className={
                p.value === period
                  ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {p.label}
            </Link>
          ))}
        </div>

        {period === "custom" ? (
          <form className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="period" value="custom" />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="from" className="text-sm font-medium">
                From
              </label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={from}
                className="h-9 w-40 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="to" className="text-sm font-medium">
                To
              </label>
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={to}
                className="h-9 w-40 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Apply
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <Link href={hrefFor({ anchor: shiftAnchor(period, anchor, -1) })} className="rounded-md border px-3 py-1.5 text-sm">
              ← Previous {period}
            </Link>
            <Link href={hrefFor({ anchor: today })} className="rounded-md border px-3 py-1.5 text-sm">
              This {period}
            </Link>
            <Link href={hrefFor({ anchor: shiftAnchor(period, anchor, 1) })} className="rounded-md border px-3 py-1.5 text-sm">
              Next {period} →
            </Link>
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground">{rangeLabel}</p>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Realized revenue" value={pesos(s.realizedCents)}>
          {change != null && (
            <span className={change >= 0 ? "text-primary" : "text-destructive"}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs previous {period === "custom" ? "period" : period}
            </span>
          )}
        </StatCard>
        <StatCard label="Avg daily sales" value={pesos(avgDaily)}>
          {avgDailyChange != null && (
            <span className={avgDailyChange >= 0 ? "text-primary" : "text-destructive"}>
              {avgDailyChange >= 0 ? "▲" : "▼"} {Math.abs(avgDailyChange)}% vs previous {period === "custom" ? "period" : period}
            </span>
          )}
        </StatCard>
        <StatCard label="Avg check per booking" value={pesos(s.avgCents)} />
        <StatCard label="Bookings" value={String(s.bookingCount)} />
        <StatCard label="Awaiting verification" value={pesos(s.awaitingCents)}>
          <span className="text-muted-foreground">
            {s.awaitingCount} pending — not yet counted
          </span>
        </StatCard>
      </div>

      <p className="text-xs text-muted-foreground">
        Realized revenue counts confirmed, completed, and no-show bookings (payment kept — no refunds). Pending
        bookings awaiting payment verification are shown separately and excluded; cancelled bookings count as zero.
        Avg daily sales divides realized revenue by the number of days elapsed in the range.
      </p>

      {/* Avg daily sales trends — fixed month/year comparisons, independent of the picker above */}
      <div className="rounded-xl border border-white/[0.08] bg-card p-4">
        <h2 className="mb-3 font-mono text-xs tracking-[0.15em] text-muted-foreground uppercase">
          Avg daily sales trends
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <TrendRow label="This month vs last month" current={momCurrent} previous={momPrevious} />
          <TrendRow label="This year vs last year" current={yoyCurrent} previous={yoyPrevious} />
        </div>
      </div>

      {/* Breakdowns */}
      <div className="grid gap-4 lg:grid-cols-3">
        <BreakdownCard title="By court" rows={s.byCourt} total={s.realizedCents} />
        <BreakdownCard title="By source" rows={s.bySource} total={s.realizedCents} />
        <BreakdownCard title="By day of week" rows={s.byWeekday} total={s.realizedCents} />
      </div>
    </div>
  );
}

function StatCard({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {children && <p className="mt-1 text-xs">{children}</p>}
    </div>
  );
}

function TrendRow({ label, current, previous }: { label: string; current: number; previous: number }) {
  const change = percentChange(current, previous);
  return (
    <div className="rounded-lg border border-border/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-bold">{pesos(current)}</span>
        {change != null && (
          <span className={"text-xs " + (change >= 0 ? "text-primary" : "text-destructive")}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">was {pesos(previous)} / day</p>
    </div>
  );
}

function BreakdownCard({ title, rows, total }: { title: string; rows: SalesBreakdown[]; total: number }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-card p-4">
      <h2 className="mb-3 font-mono text-xs tracking-[0.15em] text-muted-foreground uppercase">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No revenue in this range.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border/50 last:border-0">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 text-right text-muted-foreground">{r.count}</td>
                <td className="py-1.5 text-right font-medium">{pesos(r.cents)}</td>
                <td className="w-10 py-1.5 text-right text-xs text-muted-foreground">
                  {total ? Math.round((r.cents / total) * 100) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
