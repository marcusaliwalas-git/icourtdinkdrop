import { requireAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const { supabase } = await requireAdmin();
  const venue = await getTenant();

  // This venue's members via the join table (multi-venue Step 5); role is per-venue.
  type ProfileRow = {
    full_name: string | null;
    phone: string | null;
    skill_level: number | null;
    no_show_count: number;
    booking_restricted_until: string | null;
    created_at: string;
  };
  const { data: rows } = venue
    ? await supabase
        .from("venue_memberships")
        .select("role, profiles(full_name, phone, skill_level, no_show_count, booking_restricted_until, created_at)")
        .eq("venue_id", venue.id)
    : { data: [] as { role: string; profiles: ProfileRow | null }[] };

  const members = (rows ?? [])
    .map((r) => {
      const p = r.profiles as unknown as ProfileRow | null;
      return p ? { ...p, role: r.role as string } : null;
    })
    .filter((m): m is ProfileRow & { role: string } => m !== null)
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));

  const csv = toCsv(
    ["Name", "Phone", "Skill level", "Role", "No-shows", "Restricted until", "Joined"],
    members.map((m) => [
      m.full_name,
      m.phone,
      m.skill_level,
      m.role,
      m.no_show_count,
      m.booking_restricted_until,
      m.created_at,
    ])
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="members-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
