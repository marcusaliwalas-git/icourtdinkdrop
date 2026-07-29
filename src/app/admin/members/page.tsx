import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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

  let query = supabase
    .from("profiles")
    .select("id, full_name, phone, skill_level, role, no_show_count, booking_restricted_until")
    .order("full_name");

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data: members } = await query;

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
          {(members ?? []).map((m) => {
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
