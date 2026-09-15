import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { featureEnabled } from "@/lib/features";
import { formatInTimezone } from "@/lib/time";
import { periodBounds, shiftAnchor } from "@/lib/period-range";
import { summarizeExpenses } from "@/lib/expenses";
import { ExpensesManager } from "./expenses-manager";

export const dynamic = "force-dynamic";

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
}

export default async function AdminExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ anchor?: string }>;
}) {
  const params = await searchParams;
  const venue = await getTenant();
  if (!venue) return <p className="text-muted-foreground">Set up your venue first.</p>;
  if (!featureEnabled(venue.features, "expenses")) notFound();

  const today = formatInTimezone(new Date(), "yyyy-MM-dd", venue.timezone);
  const anchor = params.anchor ?? today;
  const { from, to } = periodBounds("month", anchor);

  const supabase = await createClient();
  // Venue-scoped: RLS restricts to the caller's venues, but an admin of several would otherwise
  // pool them — narrow to this host's venue explicitly, as the Sales page does.
  const { data: expenses } = await supabase
    .from("expenses")
    .select("id, incurred_on, amount_cents, category, note")
    .eq("venue_id", venue.id)
    .gte("incurred_on", from)
    .lte("incurred_on", to)
    .order("incurred_on", { ascending: false })
    .limit(2000);

  const rows = expenses ?? [];
  const summary = summarizeExpenses(rows.map((e) => ({ amountCents: e.amount_cents, category: e.category })));
  const monthLabel = formatInTimezone(new Date(`${from}T12:00:00Z`), "MMMM yyyy", venue.timezone);

  const hrefFor = (a: string) => `/admin/expenses?anchor=${a}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Expenses</p>
        <h1 className="mt-1 text-2xl font-bold">Expenses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track venue costs so the Sales report can show net profit. Only your venue&rsquo;s admins can see these.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={hrefFor(shiftAnchor("month", anchor, -1))} className="rounded-md border px-3 py-1.5 text-sm">
          ← Previous month
        </Link>
        <Link href={hrefFor(today)} className="rounded-md border px-3 py-1.5 text-sm">
          This month
        </Link>
        <Link href={hrefFor(shiftAnchor("month", anchor, 1))} className="rounded-md border px-3 py-1.5 text-sm">
          Next month →
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        {monthLabel} · <span className="font-semibold text-foreground">{pesos(summary.totalCents)}</span> across{" "}
        {summary.count} {summary.count === 1 ? "expense" : "expenses"}
      </p>

      <ExpensesManager venueId={venue.id} defaultDate={today} expenses={rows} />
    </div>
  );
}
