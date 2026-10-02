import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { formatInTimezone } from "@/lib/time";
import { parseTstzRange } from "@/lib/availability";
import { getBookingPaymentProof } from "@/app/admin/calendar/actions";
import { PaymentGroupCard } from "./payment-group-card";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  booking_group_id: string | null;
  time_range: string;
  total_cents: number;
  reference_code: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  courts: { name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

export default async function AdminPaymentsPage() {
  const supabase = await createClient();
  const venue = await getTenant();
  if (!venue) return <p className="text-muted-foreground">Set up your venue first.</p>;

  // Pending online bookings awaiting the admin's payment check, scoped to this venue.
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, booking_group_id, time_range, total_cents, reference_code, guest_name, guest_phone, guest_email, courts!inner(name, venue_id), profiles(full_name, email)"
    )
    .eq("courts.venue_id", venue.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(500)
    .returns<Row[]>();

  // Collapse a cart (shared booking_group_id) into one review; a booking with no group is its own.
  const groups = new Map<string, Row[]>();
  for (const b of data ?? []) {
    const key = b.booking_group_id ?? b.id;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(b);
  }

  const cards = await Promise.all(
    [...groups.entries()].map(async ([key, rows]) => {
      const first = rows[0];
      const proof = await getBookingPaymentProof(first.id);
      const customer =
        first.profiles?.full_name ?? first.profiles?.email ?? first.guest_name ?? first.guest_phone ?? "Guest";
      const slots = rows
        .map((r) => {
          const { start, end } = parseTstzRange(r.time_range);
          return {
            courtName: r.courts?.name ?? "Court",
            when: `${formatInTimezone(start, "EEE, MMM d 'at' h:mm a", venue.timezone)} – ${formatInTimezone(
              end,
              "h:mm a",
              venue.timezone
            )}`,
            startMs: start.getTime(),
          };
        })
        .sort((a, b) => a.startMs - b.startMs);
      return {
        key,
        groupId: first.booking_group_id,
        firstBookingId: first.id,
        customer,
        contact: first.guest_phone ?? first.guest_email ?? first.profiles?.email ?? null,
        slots,
        totalCents: rows.reduce((sum, r) => sum + r.total_cents, 0),
        referenceCode: first.reference_code,
        paymentReference: proof.paymentReference,
        slipUrl: proof.slipUrl,
      };
    })
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Payments</p>
        <h1 className="mt-1 text-2xl font-bold">Review payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each card is one payment. Check the proof against the total, then confirm or reject the whole booking.
        </p>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
          Nothing awaiting review — you&rsquo;re all caught up. 🎉
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {cards.map(({ key, ...rest }) => (
            <PaymentGroupCard key={key} {...rest} />
          ))}
        </div>
      )}
    </div>
  );
}
