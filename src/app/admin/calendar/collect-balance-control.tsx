"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Collect a deposit booking's remaining balance, recording cash or online. Choosing Online reveals a
 * bank & reference note (like the main payment field) before saving. Used by the booking detail sheet
 * and the front desk. */
export function CollectBalanceControl({
  disabled,
  onCollect,
}: {
  disabled: boolean;
  onCollect: (method: "cash" | "online", remarks: string | null) => void;
}) {
  const [online, setOnline] = useState(false);
  const [remarks, setRemarks] = useState("");

  if (online) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Input
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Bank & reference, e.g. BPI · ref 1234567"
          className="h-8 w-60 text-xs"
        />
        <Button size="sm" variant="outline" className="h-8" disabled={disabled} onClick={() => onCollect("online", remarks)}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          disabled={disabled}
          onClick={() => {
            setOnline(false);
            setRemarks("");
          }}
        >
          Cancel
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Collect as</span>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => onCollect("cash", null)}>
        Cash
      </Button>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => setOnline(true)}>
        Online
      </Button>
    </span>
  );
}
