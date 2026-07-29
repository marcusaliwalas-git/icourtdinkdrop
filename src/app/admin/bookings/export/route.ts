import { requireAdmin } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { parseTstzRange } from "@/lib/availability";
import { formatInTimezone } from "@/lib/time";

export async function GET(request: Request) {
  const { supabase } = await requireAdmin();
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("bookings")
    .select(
      "id, status, party_size, total_cents, payment_status, source, guest_name, guest_phone, time_range, reference_code, courts(name), profiles(full_name, phone)"
    )
    .order("time_range", { ascending: false });

  if (from || to) {
    const fromIso = from ? `${from}T00:00:00Z` : "-infinity";
    const toIso = to ? `${to}T23:59:59Z` : "infinity";
    query = query.filter("time_range", "ov", `[${fromIso},${toIso}]`);
  }

  const { data: bookings } = await query.limit(2000);

  const csv = toCsv(
    ["Reference", "Court", "Starts", "Ends", "Booked by", "Phone", "Party", "Total (PHP)", "Payment", "Source", "Status"],
    (bookings ?? []).map((b) => {
      const { start, end } = parseTstzRange(b.time_range);
      const court = (b.courts as unknown as { name: string } | null)?.name ?? "";
      const profile = b.profiles as unknown as { full_name: string | null; phone: string | null } | null;
      return [
        b.reference_code,
        court,
        formatInTimezone(start, "yyyy-MM-dd HH:mm"),
        formatInTimezone(end, "yyyy-MM-dd HH:mm"),
        profile?.full_name ?? b.guest_name ?? "",
        profile?.phone ?? b.guest_phone ?? "",
        b.party_size,
        (b.total_cents / 100).toFixed(2),
        b.payment_status,
        b.source,
        b.status,
      ];
    })
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
