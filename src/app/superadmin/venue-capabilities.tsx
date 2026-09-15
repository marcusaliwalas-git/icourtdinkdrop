"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VENUE_FEATURES, featureEnabled } from "@/lib/features";
import { setVenueFeature } from "./actions";

/** Super-admin control: enable/disable each capability for one venue. A capability is on unless
 * explicitly turned off; the count of disabled ones shows on the trigger. */
export function VenueCapabilities({ venueId, features }: { venueId: string; features: unknown }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const disabledCount = VENUE_FEATURES.filter((f) => !featureEnabled(features, f.key)).length;

  function toggle(key: string, enabled: boolean) {
    setError(null);
    setPendingKey(key);
    startTransition(async () => {
      const result = await setVenueFeature(venueId, key, enabled);
      setPendingKey(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost">
          Capabilities{disabledCount > 0 ? ` (${disabledCount} off)` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Capabilities</p>
          {VENUE_FEATURES.map((f) => {
            const on = featureEnabled(features, f.key);
            return (
              <div key={f.key} className="flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-sm">{f.label}</span>
                  <span className="text-xs text-muted-foreground">{f.description}</span>
                </div>
                <Button
                  size="sm"
                  variant={on ? "outline" : "default"}
                  className="shrink-0"
                  disabled={isPending}
                  onClick={() => toggle(f.key, !on)}
                >
                  {pendingKey === f.key ? "…" : on ? "On" : "Off"}
                </Button>
              </div>
            );
          })}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
