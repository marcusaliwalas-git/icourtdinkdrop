import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { featureEnabled } from "@/lib/features";
import { formatInTimezone, startOfLocalDayUtc, endOfLocalDayUtc } from "@/lib/time";
import { StoreHistory, type HistorySale } from "./store-history-client";
import { AddStoreSale, type AddSaleProduct } from "./add-store-sale";

export const dynamic = "force-dynamic";

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function StoreSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  // Staff (admins + front desk) can review and void past sales — it's an operational log, not an
  // analytics report.
  await requireStaff();
  const params = await searchParams;
  const venue = await getTenant();
  if (!venue) return <p className="text-muted-foreground">Set up your venue first.</p>;
  if (!featureEnabled(venue.features, "store")) notFound();

  const supabase = await createClient();
  const tz = venue.timezone;
  const today = formatInTimezone(new Date(), "yyyy-MM-dd", tz);
  const to = params.to ?? today;
  const from = params.from ?? addDaysToDateStr(today, -29);

  const [{ data }, { data: productRows }] = await Promise.all([
    supabase
      .from("product_sales")
      .select(
        "id, sold_at, total_cents, payment_method, payment_remarks, product_sale_items(name_snapshot, quantity), profiles(full_name)"
      )
      .eq("venue_id", venue.id)
      .gte("sold_at", startOfLocalDayUtc(from, tz).toISOString())
      .lte("sold_at", endOfLocalDayUtc(to, tz).toISOString())
      .order("sold_at", { ascending: false })
      .limit(2000),
    supabase
      .from("products")
      .select("id, name, price_cents")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);

  const products: AddSaleProduct[] = (productRows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    priceCents: p.price_cents,
  }));

  const sales: HistorySale[] = (data ?? []).map((s) => {
    const d = new Date(s.sold_at);
    return {
      id: s.id,
      timeLabel: formatInTimezone(d, "h:mm a", tz),
      dayKey: formatInTimezone(d, "yyyy-MM-dd", tz),
      dayLabel: formatInTimezone(d, "EEEE, MMM d", tz),
      totalCents: s.total_cents,
      method: s.payment_method,
      remarks: s.payment_remarks,
      cashier: (s.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
      items: ((s.product_sale_items ?? []) as { name_snapshot: string; quantity: number }[]).map((i) => ({
        name: i.name_snapshot,
        quantity: i.quantity,
      })),
    };
  });

  // Quick-range presets as links that set from/to.
  const quick: { label: string; from: string; to: string }[] = [
    { label: "Today", from: today, to: today },
    { label: "Last 7 days", from: addDaysToDateStr(today, -6), to: today },
    { label: "Last 30 days", from: addDaysToDateStr(today, -29), to: today },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Store</p>
        <h1 className="mt-1 text-2xl font-bold">Sales history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every retail sale, newest first. Log one here if it wasn&rsquo;t rung up at the front desk.
        </p>
      </div>

      <AddStoreSale venueId={venue.id} products={products} defaultDate={to} today={today} timezone={tz} />

      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {quick.map((r) => {
            const active = r.from === from && r.to === to;
            return (
              <Link
                key={r.label}
                href={`/admin/store?from=${r.from}&to=${r.to}`}
                className={
                  active
                    ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                    : "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                }
              >
                {r.label}
              </Link>
            );
          })}
        </div>
        <form className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="from" className="text-sm font-medium">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={from}
              max={to}
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
              max={today}
              className="h-9 w-40 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
            />
          </div>
          <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            Apply
          </button>
        </form>
      </div>

      <StoreHistory sales={sales} />
    </div>
  );
}
