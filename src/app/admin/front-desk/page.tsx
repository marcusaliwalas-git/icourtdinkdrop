import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { formatInTimezone, startOfLocalDayUtc, endOfLocalDayUtc } from "@/lib/time";
import { parseTstzRange } from "@/lib/availability";
import { featureEnabled } from "@/lib/features";
import { FrontDesk, type DeskBooking } from "./front-desk-client";
import { StoreRegister, type StoreProduct, type StoreSale } from "./store-panel";

export const dynamic = "force-dynamic";

export default async function FrontDeskPage() {
  const supabase = await createClient();
  const venue = await getTenant();
  if (!venue) return <p className="text-muted-foreground">Set up your venue first.</p>;

  const tz = venue.timezone;
  const today = formatInTimezone(new Date(), "yyyy-MM-dd", tz);
  const dayStart = startOfLocalDayUtc(today, tz);
  const dayEnd = endOfLocalDayUtc(today, tz);

  // Everyone due at the desk today: pending (needs payment check) and confirmed (ready / arriving).
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, status, checked_in_at, party_size, total_cents, deposit_cents, balance_payment_method, payment_status, source, guest_name, guest_phone, guest_email, time_range, reference_code, booking_group_id, courts!inner(name, venue_id), profiles(full_name, phone, email), booking_equipment(quantity, equipment(name))"
    )
    .eq("courts.venue_id", venue.id)
    .in("status", ["pending", "confirmed"])
    .filter("time_range", "ov", `[${dayStart.toISOString()},${dayEnd.toISOString()})`)
    .order("time_range", { ascending: true });

  const bookings: DeskBooking[] = (data ?? []).map((b) => {
    const { start, end } = parseTstzRange(b.time_range as string);
    const court = b.courts as unknown as { name: string } | null;
    const profile = b.profiles as unknown as { full_name: string | null; phone: string | null; email: string | null } | null;
    return {
      id: b.id,
      status: b.status,
      checkedIn: b.checked_in_at != null,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      courtName: court?.name ?? "Court",
      customerName: profile?.full_name ?? b.guest_name ?? "Guest",
      email: profile?.email ?? b.guest_email ?? null,
      phone: profile?.phone ?? b.guest_phone ?? null,
      partySize: b.party_size,
      totalCents: b.total_cents,
      // Outstanding deposit balance to collect at the venue (0 when none / already collected).
      balanceDueCents:
        b.deposit_cents != null && b.balance_payment_method == null ? Math.max(0, b.total_cents - b.deposit_cents) : 0,
      paymentStatus: b.payment_status,
      referenceCode: b.reference_code,
      isOnline: b.source === "online",
      equipment: ((b.booking_equipment ?? []) as unknown as { quantity: number; equipment: { name: string } | null }[]).map(
        (e) => ({ name: e.equipment?.name ?? "Equipment", quantity: e.quantity })
      ),
    };
  });

  // Retail / concessions (opt-in per venue): the active catalog plus today's sales, shown as a
  // point-of-sale panel above the booking list so desk staff can ring up water, food, etc.
  const storeEnabled = featureEnabled(venue.features, "store");
  let storeProducts: StoreProduct[] = [];
  let storeSales: StoreSale[] = [];
  let cashierName = "Front desk";
  if (storeEnabled) {
    // Who's at the register — shown in the POS header.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: me } = user
      ? await supabase.from("profiles").select("full_name").eq("id", user.id).single()
      : { data: null };
    if (me?.full_name) cashierName = me.full_name;

    const [{ data: productRows }, { data: saleRows }] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, price_cents, category, track_stock, stock, available")
        .eq("venue_id", venue.id)
        .eq("is_active", true)
        .order("sort_order")
        .order("name"),
      supabase
        .from("product_sales")
        .select("id, sold_at, total_cents, payment_method, payment_remarks, product_sale_items(name_snapshot, quantity)")
        .eq("venue_id", venue.id)
        .gte("sold_at", dayStart.toISOString())
        .lte("sold_at", dayEnd.toISOString())
        .order("sold_at", { ascending: false }),
    ]);
    storeProducts = (productRows ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.price_cents,
      category: p.category,
      trackStock: p.track_stock,
      stock: p.stock,
      available: p.available,
    }));
    storeSales = (saleRows ?? []).map((s) => ({
      id: s.id,
      soldAtIso: s.sold_at,
      totalCents: s.total_cents,
      method: s.payment_method,
      remarks: s.payment_remarks,
      items: ((s.product_sale_items ?? []) as { name_snapshot: string; quantity: number }[]).map((i) => ({
        name: i.name_snapshot,
        quantity: i.quantity,
      })),
    }));
  }

  return (
    <div className="flex flex-col gap-4">
      {storeEnabled && (
        <StoreRegister
          venueId={venue.id}
          products={storeProducts}
          sales={storeSales}
          timezone={tz}
          storeName={venue.name}
          cashierName={cashierName}
        />
      )}
      <FrontDesk
        bookings={bookings}
        timezone={tz}
        dateLabel={formatInTimezone(new Date(), "EEEE, MMMM d", tz)}
      />
    </div>
  );
}
