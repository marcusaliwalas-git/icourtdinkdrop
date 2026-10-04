"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addMembershipPlan, updateMembershipPlan, deleteMembershipPlan } from "./actions";

export type MembershipPlan = {
  id: string;
  name: string;
  price_cents: number;
  sale_price_cents: number | null;
  duration_days: number;
  inclusions: string[];
  sort_order: number;
  is_active: boolean;
};

export type PaymentAccountLite = { bank_name: string; account_name: string; account_number: string };

const textareaClass =
  "rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function pesos(cents: number) {
  return `₱${(cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

/** Add or edit one membership tier in a popup. `plan` undefined = add mode. */
function MembershipPlanDialog({
  venueId,
  plan,
  nextSortOrder,
  trigger,
}: {
  venueId: string;
  plan?: MembershipPlan;
  nextSortOrder?: number;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    if (plan) {
      formData.set("sortOrder", String(plan.sort_order));
    } else {
      formData.set("venueId", venueId);
      formData.set("sortOrder", String(nextSortOrder ?? 0));
    }
    setError(null);
    startTransition(async () => {
      const result = plan ? await updateMembershipPlan(plan.id, formData) : await addMembershipPlan(formData);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  function onDelete() {
    if (!plan) return;
    setError(null);
    startDeleteTransition(async () => {
      const result = await deleteMembershipPlan(plan.id);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : "Add a tier"}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="planName">Tier name</Label>
            <Input id="planName" name="name" defaultValue={plan?.name} placeholder="e.g. Pro" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="planPrice">Price (₱)</Label>
            <Input
              id="planPrice"
              name="price"
              type="number"
              min={0}
              step={1}
              defaultValue={plan ? plan.price_cents / 100 : ""}
              placeholder="e.g. 3000"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="planSalePrice">Sale price (₱, optional)</Label>
            <Input
              id="planSalePrice"
              name="salePrice"
              type="number"
              min={0}
              step={1}
              defaultValue={plan?.sale_price_cents != null ? plan.sale_price_cents / 100 : ""}
              placeholder="On sale"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="planDuration">Term (days)</Label>
            <Input
              id="planDuration"
              name="durationDays"
              type="number"
              min={1}
              defaultValue={plan?.duration_days ?? ""}
              placeholder="e.g. 365"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="planInclusions">Inclusions (one per line)</Label>
            <textarea
              id="planInclusions"
              name="inclusions"
              rows={3}
              defaultValue={plan?.inclusions.join("\n")}
              placeholder={"Free paddle rental\nPriority court booking\n1 free coaching session"}
              className={textareaClass}
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked={plan?.is_active ?? true} className="size-4" />
            Active (shown to members)
          </label>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <DialogFooter className="sm:col-span-2">
            {plan && (
              <Button type="button" variant="ghost" className="mr-auto text-destructive" disabled={isDeleting} onClick={onDelete}>
                {isDeleting ? "Removing…" : "Remove"}
              </Button>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : plan ? "Save changes" : "Add tier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Offer one or more membership tiers (e.g. <strong>Basic</strong>, <strong>Pro</strong>). Members pick a tier on
          the Membership page, transfer the fee, and upload a receipt for you to review under{" "}
          <strong>People → Subscription Requests</strong>.
        </p>
        <MembershipPlanDialog venueId={venueId} nextSortOrder={plans.length} trigger={<Button size="sm">Add tier</Button>} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tier</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Sale</TableHead>
            <TableHead className="text-right">Term</TableHead>
            <TableHead className="text-right">Inclusions</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-0"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="text-right">{pesos(p.price_cents)}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {p.sale_price_cents != null ? pesos(p.sale_price_cents) : "—"}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">{p.duration_days} days</TableCell>
              <TableCell className="text-right text-muted-foreground">{p.inclusions.length}</TableCell>
              <TableCell>
                {p.is_active ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Inactive
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <MembershipPlanDialog
                  venueId={venueId}
                  plan={p}
                  trigger={
                    <Button size="sm" variant="outline">
                      Edit
                    </Button>
                  }
                />
              </TableCell>
            </TableRow>
          ))}
          {plans.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No tiers yet. Add one so members can subscribe.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

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
