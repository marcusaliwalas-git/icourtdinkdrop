import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const venue = await getTenant();

  // Who belongs to this venue — read the venue_memberships join table (multi-venue Step 5); the
  // role shown is the member's role at *this* venue.
  type ProfileRow = {
    id: string;
    full_name: string | null;
    phone: string | null;
    skill_level: number | null;
    no_show_count: number;
    booking_restricted_until: string | null;
  };
  const { data: rows } = venue
    ? await supabase
        .from("venue_memberships")
        .select("role, profiles(id, full_name, phone, skill_level, no_show_count, booking_restricted_until)")
        .eq("venue_id", venue.id)
    : { data: [] as { role: string; profiles: ProfileRow | null }[] };

  let members = (rows ?? [])
    .map((r) => {
      const p = r.profiles as unknown as ProfileRow | null;
      return p ? { ...p, role: r.role as string } : null;
    })
    .filter((m): m is ProfileRow & { role: string } => m !== null);

  if (q) {
    const needle = q.toLowerCase();
    members = members.filter(
      (m) => (m.full_name ?? "").toLowerCase().includes(needle) || (m.phone ?? "").includes(q)
    );
  }
  members.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Members</h1>
        <div className="flex items-center gap-2">
          <form className="flex gap-2">
            <Input
              name="q"
              placeholder="Search name or phone"
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Skill</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>No-shows</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const restricted = m.booking_restricted_until && new Date(m.booking_restricted_until) > new Date();
            return (
              <TableRow key={m.id}>
                <TableCell>
                  <Link href={`/admin/members/${m.id}`} className="underline underline-offset-2">
                    {m.full_name || "(no name)"}
                  </Link>
                </TableCell>
                <TableCell>{m.phone ?? "-"}</TableCell>
                <TableCell>{m.skill_level ?? "-"}</TableCell>
                <TableCell className="capitalize">{m.role}</TableCell>
                <TableCell>{m.no_show_count}</TableCell>
                <TableCell>
                  {restricted ? <Badge variant="destructive">Restricted</Badge> : <Badge variant="secondary">OK</Badge>}
                </TableCell>
              </TableRow>
            );
          })}
          {(members ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No members found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
