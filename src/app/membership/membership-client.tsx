"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { submitMembershipRequest } from "./actions";

const MAX_SLIP_BYTES = 5 * 1024 * 1024;
const ACCEPTED_SLIP_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

export interface PaymentAccount {
  bank_name: string;
  account_name: string;
  account_number: string;
  remarks: string | null;
  qr_url: string | null;
}

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export function MembershipPurchase({
  priceCents,
  durationDays,
  accounts,
}: {
  priceCents: number;
  durationDays: number;
  accounts: PaymentAccount[];
}) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [slip, setSlip] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!slip) {
      setError("Attach a screenshot or photo of your transfer receipt.");
      return;
    }
    if (slip.size > MAX_SLIP_BYTES) {
      setError("That file is too large (max 5 MB).");
      return;
    }
    if (!ACCEPTED_SLIP_TYPES.includes(slip.type)) {
      setError("Use an image (JPG, PNG, WebP, HEIC) or PDF.");
      return;
    }

    startTransition(async () => {
      const ext = slip.name.split(".").pop() || "jpg";
      const path = `membership/${crypto.randomUUID()}.${ext}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("payment-slips")
        .upload(path, slip, { contentType: slip.type });
      if (uploadError) {
        setError("Couldn't upload your receipt. Please try again.");
        return;
      }

      const result = await submitMembershipRequest({ paymentReference: reference, paymentSlipPath: path });
      if (!result.success) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  const months = Math.round(durationDays / 30);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Official membership</p>
        <p className="mt-1 text-2xl font-bold">
          {pesos(priceCents)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            / {durationDays === 365 ? "year" : `${months} month${months === 1 ? "" : "s"}`}
          </span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Unlocks member rates and the members-only booking window at this venue.
        </p>
      </div>

      {accounts.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">Transfer {pesos(priceCents)} to</p>
          <div className="mt-2 flex flex-col gap-3">
            {accounts.map((a, i) => (
              <div key={i} className="text-sm">
                <p className="font-medium">{a.bank_name}</p>
                <p className="text-muted-foreground">{a.account_name}</p>
                <p className="font-mono select-all">{a.account_number}</p>
                {a.remarks && <p className="text-xs text-muted-foreground">{a.remarks}</p>}
                {a.qr_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.qr_url} alt="Payment QR" className="mt-2 h-32 w-32 rounded-md border object-contain" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mref">Payment reference number (optional)</Label>
        <Input
          id="mref"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. GCash reference number"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mslip">Proof of payment</Label>
        <Input
          id="mslip"
          type="file"
          accept={ACCEPTED_SLIP_TYPES.join(",")}
          onChange={(e) => setSlip(e.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-muted-foreground">Screenshot or photo of your GCash / bank transfer.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Submitting…" : "Submit membership request"}
      </Button>
    </form>
  );
}
