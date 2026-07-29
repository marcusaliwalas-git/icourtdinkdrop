"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetNoShowCount, setBookingRestriction } from "../actions";

export function MemberActions({
  profileId,
  noShowCount,
  restrictedUntil,
}: {
  profileId: string;
  noShowCount: number;
  restrictedUntil: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [restrictUntil, setRestrictUntil] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const isRestricted = restrictedUntil && new Date(restrictedUntil) > new Date();

  function onResetNoShows() {
    setMessage(null);
    startTransition(async () => {
      const result = await resetNoShowCount(profileId);
      setMessage(result.error ?? "No-show count reset.");
    });
  }

  function onApplyRestriction() {
    if (!restrictUntil) return;
    setMessage(null);
    startTransition(async () => {
      const result = await setBookingRestriction(profileId, new Date(restrictUntil).toISOString());
      setMessage(result.error ?? "Booking restriction applied.");
    });
  }

  function onLiftRestriction() {
    setMessage(null);
    startTransition(async () => {
      const result = await setBookingRestriction(profileId, null);
      setMessage(result.error ?? "Booking restriction lifted.");
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={isPending || noShowCount === 0} onClick={onResetNoShows}>
          Reset no-show count
        </Button>

        {isRestricted ? (
          <Button size="sm" variant="outline" disabled={isPending} onClick={onLiftRestriction}>
            Lift booking restriction
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={restrictUntil}
              onChange={(e) => setRestrictUntil(e.target.value)}
              className="w-40"
            />
            <Button size="sm" variant="outline" disabled={isPending || !restrictUntil} onClick={onApplyRestriction}>
              Restrict until date
            </Button>
          </div>
        )}
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
