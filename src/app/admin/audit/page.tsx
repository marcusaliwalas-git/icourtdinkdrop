import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInTimezone } from "@/lib/time";

export const dynamic = "force-dynamic";

const ENTITIES = ["booking", "venue", "court", "closure", "profile"];

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const supabase = await createClient();
  const venue = await getTenant();

  let query = supabase
    .from("audit_log")
    .select("id, action, entity, entity_id, before, after, created_at, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  // Scope to this venue — RLS alone would show a multi-venue admin their other venues' history.
  if (venue) query = query.eq("venue_id", venue.id);
  if (entity) query = query.eq("entity", entity);

  const { data: entries } = await query;

  function hrefFor(e: string | null) {
    return e ? `/admin/audit?entity=${e}` : "/admin/audit";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <div className="flex flex-wrap gap-2">
          <a
            href={hrefFor(null)}
            className={`rounded-full border px-3 py-1 text-xs ${!entity ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            All
          </a>
          {ENTITIES.map((e) => (
            <a
              key={e}
              href={hrefFor(e)}
              className={`rounded-full border px-3 py-1 text-xs capitalize ${entity === e ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {e}
            </a>
          ))}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(entries ?? []).map((entry) => {
            const actor = (entry.profiles as unknown as { full_name: string | null } | null)?.full_name;
            return (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatInTimezone(new Date(entry.created_at), "MMM d, h:mm:ss a")}
                </TableCell>
                <TableCell>{actor ?? "guest / system"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{entry.action}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {entry.entity}
                  <span className="ml-1 font-mono">{entry.entity_id?.slice(0, 8)}</span>
                </TableCell>
              </TableRow>
            );
          })}
          {(entries ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No audit entries yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
