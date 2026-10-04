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

/** Add or edit one receiving account in a popup. `account` undefined = add mode. */
function PaymentDialog({
  venueId,
  account,
  nextSortOrder,
  trigger,
}: {
  venueId: string;
  account?: PaymentAccount;
  nextSortOrder?: number;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    if (account) {
      formData.set("sortOrder", String(account.sort_order));
    } else {
      formData.set("venueId", venueId);
      formData.set("sortOrder", String(nextSortOrder ?? 0));
    }
    setError(null);
    startTransition(async () => {
      const result = account ? await updatePaymentAccount(account.id, formData) : await addPaymentAccount(formData);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  function onDelete() {
    if (!account) return;
    setError(null);
    startDeleteTransition(async () => {
      const result = await deletePaymentAccount(account.id);
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
          <DialogTitle>{account ? `Edit ${account.bank_name}` : "Add an account"}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bankName">Bank / e-wallet</Label>
            <Input id="bankName" name="bankName" defaultValue={account?.bank_name} placeholder="e.g. BPI or GCash" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountName">Account name</Label>
            <Input id="accountName" name="accountName" defaultValue={account?.account_name} placeholder="e.g. Darren Pickleball Inc." required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountNumber">Account number</Label>
            <Input id="accountNumber" name="accountNumber" defaultValue={account?.account_number} placeholder="e.g. 1234-5678-90" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="remarks">Remarks (optional)</Label>
            <Input id="remarks" name="remarks" defaultValue={account?.remarks ?? ""} placeholder="e.g. GCash preferred" />
          </div>
          <QrUploadField initial={account?.qr_url ?? null} />

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <DialogFooter className="sm:col-span-2">
            {account && (
              <Button type="button" variant="ghost" className="mr-auto text-destructive" disabled={isDeleting} onClick={onDelete}>
                {isDeleting ? "Removing…" : "Remove"}
              </Button>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : account ? "Save changes" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentAccountsManager({ venueId, accounts }: { venueId: string; accounts: PaymentAccount[] }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          These accounts appear in the customer&rsquo;s <strong>Review your booking</strong> step so they know where
          to send the transfer. Add one or more.
        </p>
        <PaymentDialog venueId={venueId} nextSortOrder={accounts.length} trigger={<Button size="sm">Add account</Button>} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bank / e-wallet</TableHead>
            <TableHead>Account name</TableHead>
            <TableHead>Account number</TableHead>
            <TableHead>QR</TableHead>
            <TableHead className="w-0"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.bank_name}</TableCell>
              <TableCell className="text-muted-foreground">{a.account_name}</TableCell>
              <TableCell className="font-mono text-xs">{a.account_number}</TableCell>
              <TableCell>
                {a.qr_url ? (
                  <Badge variant="secondary">Yes</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <PaymentDialog
                  venueId={venueId}
                  account={a}
                  trigger={
                    <Button size="sm" variant="outline">
                      Edit
                    </Button>
                  }
                />
              </TableCell>
            </TableRow>
          ))}
          {accounts.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No accounts yet. Add one so customers know where to pay.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
