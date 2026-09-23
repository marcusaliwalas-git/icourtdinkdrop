import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { formatInTimezone } from "@/lib/time";
import { MembersTable, type MemberRow } from "./members-table";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;
  const supabase = await createClient();
  const venue = await getTenant();

  // Who belongs to this venue — read the venue_memberships join table (multi-venue Step 5); the
  // role shown is the member's role at *this* venue.
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

  let profiles = (rows ?? [])
    .map((r) => {
      const p = r.profiles as unknown as ProfileRow | null;
      return p ? { ...p, role: r.role as string } : null;
    })
    .filter((m): m is ProfileRow & { role: string } => m !== null);

  if (q) {
    const needle = q.toLowerCase();
    profiles = profiles.filter(
      (m) =>
        (m.full_name ?? "").toLowerCase().includes(needle) ||
        (m.email ?? "").toLowerCase().includes(needle) ||
        (m.phone ?? "").includes(q)
    );
  }
  profiles.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));

  // Who holds an active official membership *today* (venue-local) — drives the "Official" column.
  const today = venue ? formatInTimezone(new Date(), "yyyy-MM-dd", venue.timezone) : "";
  const officialSet = new Set<string>();
  if (venue) {
    const { data: officials } = await supabase
      .from("memberships")
      .select("profile_id, ends_on")
      .eq("venue_id", venue.id)
      .eq("status", "active")
      .lte("starts_on", today);
    for (const row of officials ?? []) {
      if (row.ends_on == null || row.ends_on >= today) officialSet.add(row.profile_id as string);
    }
  }

  const members: MemberRow[] = profiles.map((m) => ({
    id: m.id,
    name: m.full_name || "(no name)",
    email: m.email,
    phone: m.phone,
    role: m.role,
    official: officialSet.has(m.id),
    noShowCount: m.no_show_count,
    restricted: !!m.booking_restricted_until && new Date(m.booking_restricted_until) > new Date(),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Members</h1>
        <div className="flex items-center gap-2">
          <form className="flex gap-2">
            <Input
              name="q"
              placeholder="Search name, email, or phone"
              defaultValue={q ?? ""}
              className="w-56"
            />
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/members/export">Export CSV</Link>
          </Button>
        </div>
      </div>

      <MembersTable members={members} />
    </div>
  );
}
