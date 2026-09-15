"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadVenueMedia } from "@/app/admin/homepage/media-upload";
import { addPaymentAccount, updatePaymentAccount, deletePaymentAccount } from "./actions";

export type PaymentAccount = {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  remarks: string | null;
  qr_url: string | null;
  sort_order: number;
};

/** Optional payment-QR image for one account. Uploads to the shared media bucket and carries the
 * resulting URL in a hidden `qrUrl` field so it saves with the surrounding form. */
function QrUploadField({ initial }: { initial: string | null }) {
  const [url, setUrl] = useState(initial ?? "");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setUploading(true);
    const result = await uploadVenueMedia(file);
    setUploading(false);
    if ("error" in result) return setErr(result.error);
    if (result.type !== "image") return setErr("Choose an image file for the QR.");
    setUrl(result.url);
  }

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label>Payment QR (optional)</Label>
      <input type="hidden" name="qrUrl" value={url} />
      <div className="flex items-center gap-3">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-16 rounded border border-border object-contain" />
        )}
        <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="w-auto" />
        {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
        {url && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setUrl("")}>
            Remove
          </Button>
        )}
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

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
      <QrUploadField initial={account.qr_url} />
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
        <QrUploadField initial="" />
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
