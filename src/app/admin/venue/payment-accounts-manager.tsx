"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addPaymentAccount, updatePaymentAccount, deletePaymentAccount } from "./actions";

export type PaymentAccount = {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  remarks: string | null;
  sort_order: number;
};

function AccountRow({ account }: { account: PaymentAccount }) {
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updatePaymentAccount(account.id, formData);
      if (result.error) setError(result.error);
    });
  }

  function onDelete() {
    startDeleteTransition(async () => {
      await deletePaymentAccount(account.id);
    });
  }

  return (
    <form action={onSave} className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 p-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label>Bank / e-wallet</Label>
        <Input name="bankName" defaultValue={account.bank_name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Account name</Label>
        <Input name="accountName" defaultValue={account.account_name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Account number</Label>
        <Input name="accountNumber" defaultValue={account.account_number} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Remarks (optional)</Label>
        <Input name="remarks" defaultValue={account.remarks ?? ""} placeholder="e.g. GCash preferred" />
      </div>
      <input type="hidden" name="sortOrder" value={account.sort_order} />
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={isDeleting} onClick={onDelete}>
          Remove
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}

export function PaymentAccountsManager({ venueId, accounts }: { venueId: string; accounts: PaymentAccount[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onAdd(formData: FormData) {
    formData.set("venueId", venueId);
    formData.set("sortOrder", String(accounts.length));
    setError(null);
    startTransition(async () => {
      const result = await addPaymentAccount(formData);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        These accounts appear in the customer&rsquo;s <strong>Review your booking</strong> step so they know where to
        send the transfer. Add one or more.
      </p>

      <div className="flex flex-col gap-3">
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} />
        ))}
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">No accounts yet. Add one below.</p>
        )}
      </div>

      <form action={onAdd} className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-border/60 p-3 sm:grid-cols-2">
        <p className="text-sm font-medium sm:col-span-2">Add an account</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bankName">Bank / e-wallet</Label>
          <Input id="bankName" name="bankName" placeholder="e.g. BPI or GCash" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountName">Account name</Label>
          <Input id="accountName" name="accountName" placeholder="e.g. Darren Pickleball Inc." required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountNumber">Account number</Label>
          <Input id="accountNumber" name="accountNumber" placeholder="e.g. 1234-5678-90" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="remarks">Remarks (optional)</Label>
          <Input id="remarks" name="remarks" placeholder="e.g. GCash preferred" />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add account"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </form>
    </div>
  );
}
