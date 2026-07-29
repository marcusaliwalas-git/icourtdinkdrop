import { requireAdmin } from "@/lib/auth";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const { supabase } = await requireAdmin();

  const { data: members } = await supabase
    .from("profiles")
    .select("full_name, phone, skill_level, role, no_show_count, booking_restricted_until, created_at")
    .order("full_name");

  const csv = toCsv(
    ["Name", "Phone", "Skill level", "Role", "No-shows", "Restricted until", "Joined"],
    (members ?? []).map((m) => [
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
