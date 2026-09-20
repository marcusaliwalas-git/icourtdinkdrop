import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookingsTable } from "./bookings-table";
import { getTenant } from "@/lib/tenant";
import { compareCourtName } from "@/lib/courts";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { value: "active", label: "All active (pending + confirmed)" },
  { value: "pending", label: "Pending only" },
  { value: "confirmed", label: "Confirmed only" },
  { value: "all", label: "All statuses" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

const PAYMENT_FILTERS = [
  { value: "all", label: "All payments" },
  { value: "pending", label: "Pending payment (unpaid)" },
] as const;

type PaymentFilter = (typeof PAYMENT_FILTERS)[number]["value"];

function statusesFor(filter: StatusFilter): string[] | null {
  switch (filter) {
    case "pending":
      return ["pending"];
    case "confirmed":
      return ["confirmed"];
    case "active":
      return ["pending", "confirmed"];
    case "all":
      return null;
  }
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; court?: string; q?: string; from?: string; to?: string; payment?: string }>;
}) {
  const params = await searchParams;
  const status = (STATUS_FILTERS.some((s) => s.value === params.status) ? params.status : "active") as StatusFilter;
  const payment = (PAYMENT_FILTERS.some((p) => p.value === params.payment) ? params.payment : "all") as PaymentFilter;
  const courtId = params.court ?? "all";
  const q = params.q?.trim() ?? "";
  const { from, to } = params;

  const supabase = await createClient();

  const venue = await getTenant();

  if (!venue) {
    return <p className="text-muted-foreground">Set up your venue first.</p>;
  }

  const { data: courts } = await supabase
    .from("courts")
    .select("id, name")
    .eq("venue_id", venue.id)
    .order("name");
  courts?.sort(compareCourtName); // natural order: Court 2 before Court 10

  let query = supabase
    .from("bookings")
    .select(
      "id, status, party_size, total_cents, payment_status, payment_method, source, guest_name, guest_phone, time_range, reference_code, booking_group_id, created_at, courts!inner(name, venue_id), profiles(full_name, phone, email)"
    )
    .eq("courts.venue_id", venue.id) // scope to this venue — RLS alone pools all of a multi-venue admin's venues
    .order("time_range", { ascending: true })
    .limit(500);

  const statuses = statusesFor(status);
  if (statuses) query = query.in("status", statuses);
  // "Pending payment" = walk-in/prebook slots still owed at the venue (pay_at_venue).
  if (payment === "pending") query = query.eq("payment_status", "pay_at_venue");
  if (courtId !== "all") query = query.eq("court_id", courtId);
  if (from || to) {
    const fromIso = from ? `${from}T00:00:00Z` : "-infinity";
    const toIso = to ? `${to}T23:59:59Z` : "infinity";
    query = query.filter("time_range", "ov", `[${fromIso},${toIso}]`);
  }

  if (q) {
    const { data: matchingProfiles } = await supabase
      .from("profiles")
      .select("id")
      .ilike("full_name", `%${q}%`);
    const profileIds = (matchingProfiles ?? []).map((p) => p.id);
    const orParts = [
      `guest_name.ilike.%${q}%`,
      `guest_phone.ilike.%${q}%`,
      `reference_code.ilike.%${q}%`,
    ];
    if (profileIds.length) orParts.push(`booked_by.in.(${profileIds.join(",")})`);
    query = query.or(orParts.join(","));
  }

  const { data: bookings } = await query;

  function withParams(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged = { status, payment, court: courtId, q, from, to, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "all" && value !== "") next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/admin/bookings?${qs}` : "/admin/bookings";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Bookings</p>
          <h1 className="mt-1 text-2xl font-bold">Active bookings</h1>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/admin/bookings/export${from || to ? `?from=${from ?? ""}&to=${to ?? ""}` : ""}`}>
            Export CSV
          </Link>
        </Button>
      </div>

      <form
        key={`${status}-${payment}-${courtId}-${q}-${from ?? ""}-${to ?? ""}`}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.08] bg-card p-4"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            Search
          </label>
          <Input id="q" name="q" placeholder="Name, phone, or reference" defaultValue={q} className="w-56" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-sm font-medium">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="h-9 w-56 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value} className="bg-card text-foreground">
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="payment" className="text-sm font-medium">
            Payment
          </label>
          <select
            id="payment"
            name="payment"
            defaultValue={payment}
            className="h-9 w-52 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
          >
            {PAYMENT_FILTERS.map((p) => (
              <option key={p.value} value={p.value} className="bg-card text-foreground">
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="court" className="text-sm font-medium">
            Court
          </label>
          <select
            id="court"
            name="court"
            defaultValue={courtId}
            className="h-9 w-44 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
          >
            <option value="all" className="bg-card text-foreground">
              All courts
            </option>
            {(courts ?? []).map((c) => (
              <option key={c.id} value={c.id} className="bg-card text-foreground">
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="from" className="text-sm font-medium">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={from ?? ""} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="to" className="text-sm font-medium">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={to ?? ""} className="w-40" />
        </div>
        <Button type="submit" size="sm">
          Apply filters
        </Button>
        {(status !== "active" || payment !== "all" || courtId !== "all" || q || from || to) && (
          <Button asChild type="button" size="sm" variant="ghost">
            <Link href="/admin/bookings">Reset</Link>
          </Button>
        )}
      </form>

      <p className="text-sm text-muted-foreground">
        {(bookings ?? []).length} booking{(bookings ?? []).length === 1 ? "" : "s"}
        {statuses ? ` · ${statuses.join(" + ")}` : " · all statuses"}
      </p>

      <BookingsTable bookings={(bookings ?? []) as never} timezone={venue.timezone} />

      {/* Quick links to re-run common views without retyping filters. */}
      <div className="flex gap-3 text-xs text-muted-foreground">
        <Link href={withParams({ status: "pending" })} className="underline underline-offset-2 hover:text-foreground">
          Just pending
        </Link>
        <Link href={withParams({ status: "confirmed" })} className="underline underline-offset-2 hover:text-foreground">
          Just confirmed
        </Link>
        <Link href={withParams({ status: "active" })} className="underline underline-offset-2 hover:text-foreground">
          All active
        </Link>
      </div>
    </div>
  );
}
