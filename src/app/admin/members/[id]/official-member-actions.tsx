"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { grantOfficialMembership, endOfficialMembership } from "../actions";

export type MembershipTier = {
  id: string;
  name: string;
  price_cents: number;
  sale_price_cents: number | null;
  duration_days: number;
};

function pesos(cents: number) {
  return `₱${(cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

/** today + days, as YYYY-MM-DD. */
function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30";

export function OfficialMemberActions({
  profileId,
  activeUntil,
  activeTier,
  tiers,
}: {
  profileId: string;
  activeUntil: string | null; // ends_on of the current active membership, or null if none
  activeTier: string | null; // tier of the current active membership
  tiers: MembershipTier[]; // the venue's active membership plans to choose from
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tierName, setTierName] = useState(tiers[0]?.name ?? "");
  // End date defaults from the chosen tier's duration; the admin can still adjust it.
  const [endsOn, setEndsOn] = useState(tiers[0] ? addDaysISO(tiers[0].duration_days) : "");
  const [endsOnTouched, setEndsOnTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTier = useMemo(() => tiers.find((t) => t.name === tierName), [tiers, tierName]);

  function onTierChange(name: string) {
    setTierName(name);
    const t = tiers.find((x) => x.name === name);
    // Re-default the end date from the new tier's duration unless the admin set it by hand.
    if (t && !endsOnTouched) setEndsOn(addDaysISO(t.duration_days));
  }

  function onGrant() {
    setError(null);
    startTransition(async () => {
      const result = await grantOfficialMembership(profileId, tierName, endsOn);
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
            ? `${activeTier ? `${activeTier} — ` : ""}active until ${activeUntil}. Official members get the member rate and the member booking window.`
            : "Not an official member — they pay standard rates and use the standard booking window."}
        </p>
      </div>

      {activeUntil ? (
        <Button variant="destructive" size="sm" className="self-start" disabled={isPending} onClick={onEnd}>
          End membership
        </Button>
      ) : tiers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No membership tiers yet. Create them in <span className="font-medium">Venue &amp; Courts → Membership</span>{" "}
          first, then you can tag members.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="membershipTier">Tier</Label>
            <select
              id="membershipTier"
              className={`${selectClass} w-56`}
              value={tierName}
              onChange={(e) => onTierChange(e.target.value)}
            >
              {tiers.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name} — {pesos(t.sale_price_cents ?? t.price_cents)} / {t.duration_days} days
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="membershipEndsOn">Ends on</Label>
            <Input
              id="membershipEndsOn"
              type="date"
              value={endsOn}
              onChange={(e) => {
                setEndsOn(e.target.value);
                setEndsOnTouched(true);
              }}
              className="w-44"
            />
          </div>
          <Button size="sm" disabled={isPending || !selectedTier} onClick={onGrant}>
            Make official member
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
