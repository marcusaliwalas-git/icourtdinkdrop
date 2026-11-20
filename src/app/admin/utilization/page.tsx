import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { featureEnabled } from "@/lib/features";
import { requireAdmin } from "@/lib/auth";
import { formatInTimezone } from "@/lib/time";
import { periodBounds, shiftAnchor, type CalendarPeriod } from "@/lib/period-range";
import { computeUtilization } from "@/lib/utilization-query";
import {
  summarizeUtilization,
  WEEKDAY_SHORT,
  WEEKDAY_ORDER,
  type UtilBreakdown,
  type HeatCell,
  type SlotStat,
  type BucketStat,
} from "@/lib/utilization";

export const dynamic = "force-dynamic";

const PERIOD_OPTIONS: { value: CalendarPeriod | "custom"; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom range" },
];

type Metric = "occupancy" | "hours" | "revenue";
const METRICS: { value: Metric; label: string }[] = [
  { value: "occupancy", label: "Occupancy %" },
  { value: "hours", label: "Booked hours" },
  { value: "revenue", label: "Revenue" },
];

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000
  );
}
function pesos(cents: number): string {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
}
function compactPesos(cents: number): string {
  const p = cents / 100;
  if (p >= 1000) return `${(p / 1000).toFixed(p >= 10000 ? 0 : 1)}k`;
  return String(Math.round(p));
}
function formatHour(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
}

export default async function AdminUtilizationPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; anchor?: string; from?: string; to?: string; court?: string; metric?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const venue = await getTenant();
  if (!venue) return <p className="text-muted-foreground">Set up your venue first.</p>;
  if (!featureEnabled(venue.features, "analytics")) notFound();

  const tz = venue.timezone;
  const period: CalendarPeriod | "custom" = PERIOD_OPTIONS.some((p) => p.value === params.period)
    ? (params.period as CalendarPeriod | "custom")
    : "month";
  const metric: Metric = METRICS.some((m) => m.value === params.metric) ? (params.metric as Metric) : "occupancy";
  const today = formatInTimezone(new Date(), "yyyy-MM-dd", tz);
  const anchor = params.anchor ?? today;
  const { from, to } =
    period === "custom" ? { from: params.from ?? today, to: params.to ?? today } : periodBounds(period, anchor);

  // Previous comparable window for the delta.
  const prev =
    period === "custom"
      ? (() => {
          const span = daysBetween(from, to);
          const prevTo = addDaysToDateStr(from, -1);
          return { from: addDaysToDateStr(prevTo, -span), to: prevTo };
        })()
      : periodBounds(period, shiftAnchor(period, anchor, -1));

  const supabase = await createClient();

  // All active courts (for the filter) + the current and previous windows.
  const { data: allCourts } = await supabase
    .from("courts")
    .select("id, name")
    .eq("venue_id", venue.id)
    .eq("is_active", true)
    .order("name");
  const courtFilter = (allCourts ?? []).some((c) => c.id === params.court) ? params.court! : null;

  const [current, previous] = await Promise.all([
    computeUtilization({ supabase, venueId: venue.id, timezone: tz, from, to, courtId: courtFilter }),
    computeUtilization({ supabase, venueId: venue.id, timezone: tz, from: prev.from, to: prev.to, courtId: courtFilter }),
  ]);

  const summary = summarizeUtilization(current.cells, current.courtNames);
  const prevSummary = summarizeUtilization(previous.cells, previous.courtNames);
  const delta = summary.pct - prevSummary.pct; // percentage points

  const heatByKey = new Map(summary.heatmap.map((c) => [`${c.weekday}|${c.hour}`, c]));
  const hourAxis = Array.from({ length: Math.max(0, summary.maxHour - summary.minHour) }, (_, i) => summary.minHour + i);
  const open = summary.heatmap.filter((c) => c.capacity > 0);
  const maxBooked = Math.max(1, ...open.map((c) => c.booked));
  const maxRevenue = Math.max(1, ...open.map((c) => c.revenue));

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      period,
      anchor,
      from,
      to,
      court: courtFilter ?? undefined,
      metric,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    return `/admin/utilization?${next.toString()}`;
  }
  const exportHref = `/admin/utilization/export?from=${from}&to=${to}${courtFilter ? `&court=${courtFilter}` : ""}`;

  const rangeLabel =
    from === to
      ? formatInTimezone(new Date(`${from}T12:00:00Z`), "MMM d, yyyy", tz)
      : `${formatInTimezone(new Date(`${from}T12:00:00Z`), "MMM d, yyyy", tz)} – ${formatInTimezone(
          new Date(`${to}T12:00:00Z`),
          "MMM d, yyyy",
          tz
        )}`;
  const periodWord = period === "custom" ? "period" : period;
  const noHours = summary.capacityHours === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Utilization</p>
          <h1 className="mt-1 text-2xl font-bold">Court utilization</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How much of your open court-time was actually booked — overall, by court, and by the hour.
          </p>
        </div>
        <Link href={exportHref} className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
          Export CSV
        </Link>
      </div>

      {/* Period picker */}
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
            {courtFilter && <input type="hidden" name="court" value={courtFilter} />}
            <input type="hidden" name="metric" value={metric} />
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
            <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
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

      {/* Court filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Court:</span>
        <Link
          href={hrefFor({ court: undefined })}
          className={
            !courtFilter
              ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
              : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          }
        >
          All courts
        </Link>
        {(allCourts ?? []).map((c) => (
          <Link
            key={c.id}
            href={hrefFor({ court: c.id })}
            className={
              courtFilter === c.id
                ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            }
          >
            {c.name}
          </Link>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{rangeLabel}</p>

      {noHours ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No open court-hours in this range. Set your operating hours under Setup → Venue &amp; Courts → Hours to
          see utilization.
        </p>
      ) : (
        <>
          {/* Headline */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Overall utilization" value={`${summary.pct}%`}>
              {prevSummary.capacityHours > 0 && (
                <span className={delta >= 0 ? "text-primary" : "text-destructive"}>
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts vs previous {periodWord}
                </span>
              )}
            </StatCard>
            <StatCard label="Booked revenue" value={pesos(summary.revenueCents)}>
              <span className="text-muted-foreground">
                {summary.bookedHours.toLocaleString()} of {summary.capacityHours.toLocaleString()} court-hours
              </span>
            </StatCard>
            {summary.busiest && (
              <StatCard label="Busiest court" value={`${summary.busiest.pct}%`}>
                <span className="text-muted-foreground">{summary.busiest.label}</span>
              </StatCard>
            )}
            {summary.quietest && (
              <StatCard label="Quietest court" value={`${summary.quietest.pct}%`}>
                <span className="text-muted-foreground">{summary.quietest.label}</span>
              </StatCard>
            )}
          </div>

          {/* Peak vs off-peak */}
          <PeakSplit peak={summary.peak} offpeak={summary.offpeak} />

          {/* Heatmap */}
          <div className="rounded-xl border border-white/[0.08] bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-xs tracking-[0.15em] text-muted-foreground uppercase">
                When your courts are busy
              </h2>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {METRICS.map((m) => (
                    <Link
                      key={m.value}
                      href={hrefFor({ metric: m.value })}
                      className={
                        m.value === metric
                          ? "rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                          : "rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                      }
                    >
                      {m.label}
                    </Link>
                  ))}
                </div>
                <Legend />
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `2.5rem repeat(${hourAxis.length}, 2rem)` }}>
                <div />
                {hourAxis.map((h) => (
                  <div key={h} className="pb-1 text-center text-[0.6rem] text-muted-foreground">
                    {formatHour(h)}
                  </div>
                ))}
                {WEEKDAY_ORDER.map((wd) => (
                  <HeatRow
                    key={wd}
                    weekday={wd}
                    hourAxis={hourAxis}
                    heatByKey={heatByKey}
                    metric={metric}
                    maxBooked={maxBooked}
                    maxRevenue={maxRevenue}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Best / worst slots */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SlotList title="Busiest slots" rows={summary.bestSlots} hint="Your peak demand — protect or premium-price these." />
            <SlotList title="Deadest slots" rows={summary.worstSlots} hint="Underused — promote, bundle, or close these." />
          </div>

          {/* Breakdowns */}
          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownCard title="By court" rows={summary.byCourt} />
            <BreakdownCard title="By day of week" rows={summary.byWeekday} />
          </div>

          <p className="text-xs text-muted-foreground">
            Utilization = booked court-hours ÷ open court-hours (your operating hours minus closures), for whole-hour
            slots. &ldquo;Booked&rdquo; counts pending, confirmed, completed, and no-show bookings; cancelled and voided
            slots are excluded. Revenue is each booking&rsquo;s total spread across its hours. Peak hours are those
            priced above a court&rsquo;s cheapest rate.
          </p>
        </>
      )}
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

function PeakSplit({ peak, offpeak }: { peak: BucketStat; offpeak: BucketStat }) {
  if (peak.capacity === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-card p-4 text-sm text-muted-foreground">
        No peak pricing configured — every open hour is at your base rate. Add rate periods under Setup → Venue &amp;
        Courts → Courts to split peak vs off-peak here.
      </div>
    );
  }
  const Row = ({ label, b }: { label: string; b: BucketStat }) => (
    <div className="flex flex-1 flex-col gap-2 rounded-lg border border-border/50 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xl font-bold">{b.pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${b.pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {pesos(b.revenue)} · {b.booked.toLocaleString()} of {b.capacity.toLocaleString()} court-hours
      </p>
    </div>
  );
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-card p-4">
      <h2 className="font-mono text-xs tracking-[0.15em] text-muted-foreground uppercase">Peak vs off-peak</h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Row label="Peak hours" b={peak} />
        <Row label="Off-peak hours" b={offpeak} />
      </div>
    </div>
  );
}

/** Traffic-light colour for a cell: red → amber → green, deepening with the value. */
function cellStyle(pct: number): React.CSSProperties {
  const rgb = pct < 34 ? "239, 68, 68" : pct < 67 ? "245, 158, 11" : "34, 197, 94";
  const alpha = 0.2 + 0.8 * (pct / 100);
  return { backgroundColor: `rgba(${rgb}, ${alpha})`, color: "var(--foreground)" };
}

function HeatRow({
  weekday,
  hourAxis,
  heatByKey,
  metric,
  maxBooked,
  maxRevenue,
}: {
  weekday: number;
  hourAxis: number[];
  heatByKey: Map<string, HeatCell>;
  metric: Metric;
  maxBooked: number;
  maxRevenue: number;
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-2 text-xs text-muted-foreground">{WEEKDAY_SHORT[weekday]}</div>
      {hourAxis.map((h) => {
        const cell = heatByKey.get(`${weekday}|${h}`);
        const isOpen = (cell?.capacity ?? 0) > 0;
        const colorPct =
          metric === "occupancy"
            ? cell?.pct ?? 0
            : metric === "hours"
              ? Math.round(((cell?.booked ?? 0) / maxBooked) * 100)
              : Math.round(((cell?.revenue ?? 0) / maxRevenue) * 100);
        const text = !isOpen
          ? ""
          : metric === "occupancy"
            ? String(cell!.pct)
            : metric === "hours"
              ? String(cell!.booked)
              : compactPesos(cell!.revenue);
        const title = `${WEEKDAY_SHORT[weekday]} ${formatHour(h)} — ${cell?.booked ?? 0}/${cell?.capacity ?? 0} booked (${cell?.pct ?? 0}%) · ${pesos(cell?.revenue ?? 0)}`;
        return (
          <div
            key={h}
            title={title}
            className={
              "flex h-7 items-center justify-center rounded-sm border border-border/40 text-[0.6rem] tabular-nums " +
              (isOpen ? "" : "bg-muted/30")
            }
            style={isOpen ? cellStyle(colorPct) : undefined}
          >
            {text}
          </div>
        );
      })}
    </>
  );
}

function Legend() {
  const stops = [0, 25, 50, 75, 100];
  return (
    <div className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
      <span>Low</span>
      {stops.map((p) => (
        <span key={p} className="size-3.5 rounded-sm border border-border/40" style={cellStyle(p)} />
      ))}
      <span>High</span>
    </div>
  );
}

function SlotList({ title, rows, hint }: { title: string; rows: SlotStat[]; hint: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-card p-4">
      <h2 className="mb-1 font-mono text-xs tracking-[0.15em] text-muted-foreground uppercase">{title}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open hours in this range.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((s) => (
            <li key={`${s.weekday}|${s.hour}`} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {WEEKDAY_SHORT[s.weekday]} {formatHour(s.hour)}–{formatHour((s.hour + 1) % 24)}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{pesos(s.revenue)}</span>
                <span className="w-10 text-right font-medium tabular-nums">{s.pct}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: UtilBreakdown[] }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-card p-4">
      <h2 className="mb-3 font-mono text-xs tracking-[0.15em] text-muted-foreground uppercase">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open hours in this range.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 truncate">{r.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${r.pct}%` }} />
              </div>
              <span className="w-10 shrink-0 text-right font-medium tabular-nums">{r.pct}%</span>
              <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {r.booked}/{r.capacity}h
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
