"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { setCoachRequestStatus } from "./actions";

export type CoachRequest = {
  id: string;
  coachName: string;
  requester: string;
  contact: string;
  preferredLabel: string | null;
  message: string | null;
  status: string;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  confirmed: "bg-primary/15 text-primary",
  declined: "bg-destructive/15 text-destructive",
};

export function RequestsList({ requests }: { requests: CoachRequest[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function update(id: string, status: "confirmed" | "declined" | "pending") {
    startTransition(async () => {
      await setCoachRequestStatus(id, status);
      router.refresh();
    });
  }

  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">No coaching requests yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
      {requests.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium">
              {r.requester} → {r.coachName}{" "}
              <Badge className={STATUS_BADGE[r.status] ?? STATUS_BADGE.pending}>{r.status}</Badge>
            </span>
            <span className="text-xs text-muted-foreground">{r.contact}</span>
            {r.preferredLabel && <span className="text-xs text-muted-foreground">Prefers: {r.preferredLabel}</span>}
            {r.message && <span className="text-xs text-muted-foreground">“{r.message}”</span>}
          </div>
          <div className="flex items-center gap-1">
            {r.status !== "confirmed" && (
              <Button size="sm" disabled={isPending} onClick={() => update(r.id, "confirmed")}>
                Confirm
              </Button>
            )}
            {r.status !== "declined" && (
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => update(r.id, "declined")}>
                Decline
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
