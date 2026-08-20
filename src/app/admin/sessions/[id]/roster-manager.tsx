"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addSignup, setCheckIn, removeSignup } from "@/app/host/actions";

export type RosterEntry = {
  id: string;
  name: string;
  isGuest: boolean;
  checkedIn: boolean;
};

// Roster management for the admin detail page. Adds are walk-ins by name — the real
// challenge-court flow, where the host adds whoever shows up at the desk. Reuses the same
// host actions the run board uses (all gated on is_session_host in the DB).
export function RosterManager({ sessionId, entries }: { sessionId: string; entries: RosterEntry[] }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run(fn: () => Promise<{ success: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) setError(result.message ?? "Something went wrong.");
      else router.refresh();
    });
  }

  function onAdd(formData: FormData) {
    const value = String(formData.get("name") ?? "").trim();
    if (!value) return;
    run(async () => {
      const r = await addSignup(sessionId, { guestName: value, checkIn: true });
      if (r.success) setName("");
      return r;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={onAdd} className="flex gap-2">
        <Input
          name="name"
          placeholder="Add a player by name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Player name"
        />
        <Button type="submit" disabled={isPending || !name.trim()}>
          Add
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No players yet. Add walk-ins as they arrive.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2 text-sm">
                {e.name}
                {e.isGuest && <Badge className="bg-muted text-muted-foreground">Guest</Badge>}
                {e.checkedIn && <Badge className="bg-primary/15 text-primary">Checked in</Badge>}
              </span>
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => run(() => setCheckIn(e.id, !e.checkedIn))}
                >
                  {e.checkedIn ? "Check out" : "Check in"}
                </Button>
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => removeSignup(e.id))}>
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
