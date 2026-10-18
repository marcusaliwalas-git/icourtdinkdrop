"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FrontDeskToggle } from "./front-desk-toggle";

export interface MemberRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  /** Active membership tier name, or null for a non-member (shown as "Regular"). */
  membershipType: string | null;
  noShowCount: number;
  restricted: boolean;
}

type SortKey = "name" | "email" | "phone" | "role" | "membership" | "noShows" | "status";

export function MembersTable({ members }: { members: MemberRow[] }) {
  // Default to name A→Z (matches the server's initial order).
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  const rows = useMemo(() => {
    const val = (m: MemberRow): string | number => {
      switch (sort.key) {
        case "name":
          return m.name.toLowerCase();
        case "email":
          return (m.email ?? "").toLowerCase();
        case "phone":
          return m.phone ?? "";
        case "role":
          return m.role;
        case "membership":
          return (m.membershipType ?? "Regular").toLowerCase();
        case "noShows":
          return m.noShowCount;
        case "status":
          return m.restricted ? 1 : 0;
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...members].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [members, sort]);

  function SortHeader({ label, k, className }: { label: string; k: SortKey; className?: string }) {
    const active = sort.key === k;
    return (
      <TableHead className={className}>
        <button
          type="button"
          className="flex items-center gap-1 hover:text-foreground"
          onClick={() => setSort((s) => ({ key: k, dir: s.key === k && s.dir === "asc" ? "desc" : "asc" }))}
        >
          {label}
          <span className={cn("text-[0.65rem]", active ? "opacity-100" : "opacity-30")}>
            {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </TableHead>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortHeader label="Name" k="name" />
          <SortHeader label="Email" k="email" />
          <SortHeader label="Phone" k="phone" />
          <SortHeader label="Role" k="role" />
          <SortHeader label="Membership" k="membership" />
          <SortHeader label="No-shows" k="noShows" />
          <SortHeader label="Status" k="status" />
          <TableHead>Front desk</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((m) => (
          <TableRow key={m.id}>
            <TableCell>
              <Link href={`/admin/members/${m.id}`} className="underline underline-offset-2">
                {m.name}
              </Link>
            </TableCell>
            <TableCell>{m.email ?? "—"}</TableCell>
            <TableCell>{m.phone ?? "-"}</TableCell>
            <TableCell className="capitalize">{m.role}</TableCell>
            <TableCell>
              {m.membershipType ? (
                <Badge className="gap-1 bg-amber-100 text-amber-800 capitalize dark:bg-amber-400/15 dark:text-amber-300">
                  <Crown className="size-3.5" aria-hidden />
                  {m.membershipType}
                </Badge>
              ) : (
                <span className="text-muted-foreground">Regular</span>
              )}
            </TableCell>
            <TableCell>{m.noShowCount}</TableCell>
            <TableCell>
              {m.restricted ? <Badge variant="destructive">Restricted</Badge> : <Badge variant="secondary">OK</Badge>}
            </TableCell>
            <TableCell>
              <FrontDeskToggle profileId={m.id} role={m.role} />
            </TableCell>
          </TableRow>
        ))}
        {members.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground">
              No members found.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
