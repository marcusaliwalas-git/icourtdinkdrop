"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDepositPolicy } from "./actions";

/** Venue-admin toggle for the deposit (downpayment) option. On = customers may reserve with a 50%
 * deposit and pay the balance at the venue; off = full payment up front. */
export function DepositPolicy({ venueId, enabled, percent }: { venueId: string; enabled: boolean; percent: number }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    setOn(next);
    startTransition(async () => {
      const result = await setDepositPolicy(venueId, next);
      if (result.error) {
        setError(result.error);
        setOn(!next);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Deposits</h2>
      <label className="flex items-start gap-3 rounded-lg border border-border p-3.5">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 size-4"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium">Let customers reserve with a {percent}% deposit</span>
          <span className="block text-xs text-muted-foreground">
            At checkout, customers can choose to pay {percent}% online to reserve and settle the balance at the venue.
            Off = full payment up front.
          </span>
        </span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
