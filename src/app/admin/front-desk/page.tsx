import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { formatInTimezone, startOfLocalDayUtc, endOfLocalDayUtc } from "@/lib/time";
import { parseTstzRange } from "@/lib/availability";
import { FrontDesk, type DeskBooking } from "./front-desk-client";

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
      "id, status, checked_in_at, party_size, total_cents, payment_status, source, guest_name, guest_phone, time_range, reference_code, booking_group_id, courts!inner(name, venue_id), profiles(full_name, phone)"
    )
    .eq("courts.venue_id", venue.id)
    .in("status", ["pending", "confirmed"])
    .filter("time_range", "ov", `[${dayStart.toISOString()},${dayEnd.toISOString()})`)
    .order("time_range", { ascending: true });

  const bookings: DeskBooking[] = (data ?? []).map((b) => {
    const { start, end } = parseTstzRange(b.time_range as string);
    const court = b.courts as unknown as { name: string } | null;
    const profile = b.profiles as unknown as { full_name: string | null; phone: string | null } | null;
    return {
      id: b.id,
      status: b.status,
      checkedIn: b.checked_in_at != null,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      courtName: court?.name ?? "Court",
      customerName: profile?.full_name ?? b.guest_name ?? "Guest",
      phone: profile?.phone ?? b.guest_phone ?? null,
      partySize: b.party_size,
      totalCents: b.total_cents,
      paymentStatus: b.payment_status,
      referenceCode: b.reference_code,
      isOnline: b.source === "online",
    };
  });

  return (
    <FrontDesk
      bookings={bookings}
      timezone={tz}
      dateLabel={formatInTimezone(new Date(), "EEEE, MMMM d", tz)}
    />
  );
}
