"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Pre-resolved on the server so this stays a plain, serializable list — each row already carries its
// human-readable summary and a lowercase `search` haystack (actor + summary + action + reference).
export type AuditRow = {
  id: string;
  when: string;
  actor: string;
  summary: string;
  action: string;
  search: string;
};

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.search.includes(needle));
  }, [q, rows]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by person, action, or reference…"
          className="max-w-sm"
          aria-label="Search audit log"
        />
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">When</TableHead>
            <TableHead className="w-40">Who</TableHead>
            <TableHead>Activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {row.when}
              </TableCell>
              <TableCell className="text-sm">{row.actor}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">{row.summary}</span>
                  <Badge variant="secondary" className="w-fit font-mono text-[10px] font-normal">
                    {row.action}
                  </Badge>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                {rows.length === 0 ? "No audit entries yet." : "No entries match your search."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
