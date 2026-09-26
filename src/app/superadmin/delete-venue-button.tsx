"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteTenant } from "./actions";

export function DeleteVenueButton({ venueId, venueName }: { venueId: string; venueName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTenant(venueId);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs whitespace-nowrap text-muted-foreground">Delete {venueName}?</span>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirming(true)}
        >
          Delete
        </Button>
      )}
      {error && <span className="max-w-[16rem] text-right text-xs text-destructive">{error}</span>}
    </div>
  );
}
