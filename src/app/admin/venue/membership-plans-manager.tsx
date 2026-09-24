"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMembershipPlan, updateMembershipPlan, deleteMembershipPlan } from "./actions";

export type MembershipPlan = {
  id: string;
  name: string;
  price_cents: number;
  duration_days: number;
  sort_order: number;
  is_active: boolean;
};

export type PaymentAccountLite = { bank_name: string; account_name: string; account_number: string };

function PlanRow({ plan }: { plan: MembershipPlan }) {
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateMembershipPlan(plan.id, formData);
      if (result.error) setError(result.error);
    });
  }

  return (
    <form action={onSave} className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 p-3 sm:grid-cols-4">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Tier name</Label>
        <Input name="name" defaultValue={plan.name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Price (₱)</Label>
        <Input name="price" type="number" min={0} step={1} defaultValue={plan.price_cents / 100} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Term (days)</Label>
        <Input name="durationDays" type="number" min={1} defaultValue={plan.duration_days} required />
      </div>
      <input type="hidden" name="sortOrder" value={plan.sort_order} />
      <label className="flex items-center gap-2 text-sm sm:col-span-4">
        <input type="checkbox" name="isActive" defaultChecked={plan.is_active} className="size-4" />
        Active (shown to members)
      </label>
      <div className="flex items-center gap-2 sm:col-span-4">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isDeleting}
          onClick={() => startDeleteTransition(async () => void (await deleteMembershipPlan(plan.id)))}
        >
          Remove
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}

export function MembershipPlansManager({
  venueId,
  plans,
  paymentAccounts,
}: {
  venueId: string;
  plans: MembershipPlan[];
  paymentAccounts: PaymentAccountLite[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onAdd(formData: FormData) {
    formData.set("venueId", venueId);
    formData.set("sortOrder", String(plans.length));
    setError(null);
    startTransition(async () => {
      const result = await addMembershipPlan(formData);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Offer one or more membership tiers (e.g. <strong>Basic</strong>, <strong>Pro</strong>). Members pick a tier on
        the Membership page, transfer the fee, and upload a receipt for you to review under{" "}
        <strong>People → Subscription Requests</strong>.
      </p>

      <div className="flex flex-col gap-3">
        {plans.map((p) => (
          <PlanRow key={p.id} plan={p} />
        ))}
        {plans.length === 0 && <p className="text-sm text-muted-foreground">No tiers yet. Add one below.</p>}
      </div>

      <form
        action={onAdd}
        className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-border/60 p-3 sm:grid-cols-4"
      >
        <p className="text-sm font-medium sm:col-span-4">Add a tier</p>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="planName">Tier name</Label>
          <Input id="planName" name="name" placeholder="e.g. Pro" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="planPrice">Price (₱)</Label>
          <Input id="planPrice" name="price" type="number" min={0} step={1} placeholder="e.g. 3000" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="planDuration">Term (days)</Label>
          <Input id="planDuration" name="durationDays" type="number" min={1} placeholder="e.g. 365" required />
        </div>
        <input type="hidden" name="isActive" value="on" />
        <div className="flex items-center gap-2 sm:col-span-4">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add tier"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </form>

      {/* What members will transfer to — managed in the Payment tab. */}
      <div className="rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">Payment methods members will see</p>
        <p className="mb-2 text-xs text-muted-foreground">
          These come from the <strong>Payment</strong> tab and appear on the Membership page.
        </p>
        {paymentAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accounts yet — add one in the Payment tab so members know where to transfer.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {paymentAccounts.map((a, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="font-medium text-foreground">{a.bank_name}</span> · {a.account_name} ·{" "}
                <span className="font-mono">{a.account_number}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
