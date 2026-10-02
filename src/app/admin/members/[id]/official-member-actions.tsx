"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { grantOfficialMembership, endOfficialMembership } from "../actions";

/** One year from today (YYYY-MM-DD), the default annual membership end date. */
function oneYearFromToday(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function OfficialMemberActions({
  profileId,
  activeUntil,
}: {
  profileId: string;
  activeUntil: string | null; // ends_on of the current active membership, or null if none
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [endsOn, setEndsOn] = useState(oneYearFromToday());
  const [error, setError] = useState<string | null>(null);

  function onGrant() {
    setError(null);
    startTransition(async () => {
      const result = await grantOfficialMembership(profileId, endsOn);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function onEnd() {
    setError(null);
    startTransition(async () => {
      const result = await endOfficialMembership(profileId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-card p-4">
      <div>
        <p className="font-medium">Official membership</p>
        <p className="text-sm text-muted-foreground">
          {activeUntil
            ? `Active until ${activeUntil}. Official members get the member rate and the member booking window.`
            : "Not an official member — they pay standard rates and use the standard booking window."}
        </p>
      </div>

      {activeUntil ? (
        <Button variant="destructive" size="sm" className="self-start" disabled={isPending} onClick={onEnd}>
          End membership
        </Button>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="membershipEndsOn">Ends on</Label>
            <Input
              id="membershipEndsOn"
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              className="w-44"
            />
          </div>
          <Button size="sm" disabled={isPending} onClick={onGrant}>
            Make official member
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
