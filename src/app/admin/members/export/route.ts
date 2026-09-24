import { requireAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { toCsv } from "@/lib/csv";
import { formatInTimezone } from "@/lib/time";

export async function GET() {
  const { supabase } = await requireAdmin();
  const venue = await getTenant();

  // This venue's members via the join table (multi-venue Step 5); role is per-venue. Columns mirror
  // the Members table view: Name, Email, Phone, Role, Official, No-shows, Status.
  type ProfileRow = {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    no_show_count: number;
    booking_restricted_until: string | null;
  };
  const { data: rows } = venue
    ? await supabase
        .from("venue_memberships")
        .select("role, profiles(id, full_name, email, phone, no_show_count, booking_restricted_until)")
        .eq("venue_id", venue.id)
    : { data: [] as { role: string; profiles: ProfileRow | null }[] };

  const members = (rows ?? [])
    .map((r) => {
      const p = r.profiles as unknown as ProfileRow | null;
      return p ? { ...p, role: r.role as string } : null;
    })
    .filter((m): m is ProfileRow & { role: string } => m !== null)
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));

  // Active membership tier today (venue-local) — drives the Membership column, same as the page.
  const today = venue ? formatInTimezone(new Date(), "yyyy-MM-dd", venue.timezone) : "";
  const tierByProfile = new Map<string, string>();
  if (venue) {
    const { data: officials } = await supabase
      .from("memberships")
      .select("profile_id, tier, ends_on")
      .eq("venue_id", venue.id)
      .eq("status", "active")
      .lte("starts_on", today)
      .order("ends_on", { ascending: false, nullsFirst: true });
    for (const row of officials ?? []) {
      if ((row.ends_on == null || row.ends_on >= today) && !tierByProfile.has(row.profile_id)) {
        tierByProfile.set(row.profile_id as string, row.tier as string);
      }
    }
  }

  const csv = toCsv(
    ["Name", "Email", "Phone", "Role", "Membership", "No-shows", "Status"],
    members.map((m) => [
      m.full_name,
      m.email,
      m.phone,
      m.role,
      tierByProfile.get(m.id) ?? "Regular",
      m.no_show_count,
      m.booking_restricted_until && new Date(m.booking_restricted_until) > new Date() ? "Restricted" : "OK",
    ])
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="members-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
