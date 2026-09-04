import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInTimezone, startOfLocalDayUtc, endOfLocalDayUtc } from "@/lib/time";
import { periodBounds, shiftAnchor, type CalendarPeriod } from "@/lib/period-range";
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

interface CustomerStats {
  key: string;
  name: string;
  contact: string | null;
  isMember: boolean;
  memberId: string | null;
  bookings: number;
  totalCents: number;
  noShows: number;
}

export default async function AdminCustomersPage({
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

  const rangeStart = startOfLocalDayUtc(from, venue.timezone);
  const rangeEnd = endOfLocalDayUtc(to, venue.timezone);

  // Every non-cancelled booking counts toward "who's booking" — a cancelled booking never
  // actually happened, but a still-pending one is a genuine booking request either way.
  const { data: bookings } = await supabase
    .from("bookings")
    .select("booked_by, guest_name, guest_phone, status, total_cents, profiles(full_name, phone)")
    .neq("status", "cancelled")
    .filter("time_range", "ov", `[${rangeStart.toISOString()},${rangeEnd.toISOString()}]`)
    .limit(10000);

  const stats = new Map<string, CustomerStats>();
  for (const b of bookings ?? []) {
    const profile = b.profiles as unknown as { full_name: string | null; phone: string | null } | null;
    const isMember = b.booked_by != null;
    const key = isMember ? `member:${b.booked_by}` : `guest:${b.guest_phone || b.guest_name || "unknown"}`;

    const existing = stats.get(key);
    if (existing) {
      existing.bookings += 1;
      existing.totalCents += b.total_cents;
      if (b.status === "no_show") existing.noShows += 1;
    } else {
      stats.set(key, {
        key,
        name: (isMember ? profile?.full_name : b.guest_name) || (isMember ? "(no name on file)" : "Guest"),
        contact: (isMember ? profile?.phone : b.guest_phone) ?? null,
        isMember,
        memberId: isMember ? b.booked_by : null,
        bookings: 1,
        totalCents: b.total_cents,
        noShows: b.status === "no_show" ? 1 : 0,
      });
    }
  }

  const ranked = [...stats.values()]
    .sort((a, b) => b.bookings - a.bookings || b.totalCents - a.totalCents)
    .slice(0, 20);

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged = { period, anchor, from, to, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) next.set(k, v);
    }
    return `/admin/customers?${next.toString()}`;
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
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Customers</p>
        <h1 className="mt-1 text-2xl font-bold">Top customers</h1>
      </div>

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
              <Input id="from" name="from" type="date" defaultValue={from} className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="to" className="text-sm font-medium">
                To
              </label>
              <Input id="to" name="to" type="date" defaultValue={to} className="w-40" />
            </div>
            <Button type="submit" size="sm">
              Apply
            </Button>
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

      <p className="text-sm text-muted-foreground">
        {rangeLabel} · {(bookings ?? []).length} booking{(bookings ?? []).length === 1 ? "" : "s"} ·{" "}
        {ranked.length} customer{ranked.length === 1 ? "" : "s"}
      </p>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Bookings</TableHead>
              <TableHead>Total spent</TableHead>
              <TableHead>No-shows</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((c, i) => (
              <TableRow key={c.key}>
                <TableCell className="text-muted-foreground">#{i + 1}</TableCell>
                <TableCell>
                  {c.isMember && c.memberId ? (
                    <Link href={`/admin/members/${c.memberId}`} className="underline underline-offset-2">
                      {c.name}
                    </Link>
                  ) : (
                    c.name
                  )}
                  <Badge variant={c.isMember ? "default" : "secondary"} className="ml-2">
                    {c.isMember ? "Member" : "Guest"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.contact ?? "-"}</TableCell>
                <TableCell>{c.bookings}</TableCell>
                <TableCell>{pesos(c.totalCents)}</TableCell>
                <TableCell className={c.noShows > 0 ? "text-destructive" : "text-muted-foreground"}>
                  {c.noShows}
                </TableCell>
              </TableRow>
            ))}
            {ranked.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No bookings in this range.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
