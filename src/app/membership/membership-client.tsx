"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { submitMembershipRequest } from "./actions";

const MAX_SLIP_BYTES = 5 * 1024 * 1024;
const ACCEPTED_SLIP_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

export interface Plan {
  id: string;
  name: string;
  priceCents: number;
  durationDays: number;
}

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

function termLabel(days: number) {
  if (days === 365) return "year";
  if (days === 30) return "month";
  const months = Math.round(days / 30);
  return months >= 1 ? `${months} month${months === 1 ? "" : "s"}` : `${days} days`;
}

export function MembershipPurchase({ plans, accounts }: { plans: Plan[]; accounts: PaymentAccount[] }) {
  const router = useRouter();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [slip, setSlip] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = plans.find((p) => p.id === planId) ?? plans[0];

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError("Pick a membership plan.");
      return;
    }
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

      const result = await submitMembershipRequest({
        planId: selected.id,
        paymentReference: reference,
        paymentSlipPath: path,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Tier selection */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Choose a plan</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {plans.map((p) => {
            const active = p.id === planId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlanId(p.id)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-4 text-left transition-colors",
                  active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/30"
                )}
              >
                <span className="font-medium">{p.name}</span>
                <span className="mt-1 text-xl font-bold">
                  {pesos(p.priceCents)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/ {termLabel(p.durationDays)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Membership unlocks member rates and the members-only booking window at this venue.
        </p>
      </div>

      {accounts.length > 0 && selected && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">Transfer {pesos(selected.priceCents)} to</p>
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

      <Button type="submit" disabled={isPending || !selected}>
        {isPending ? "Submitting…" : "Submit membership request"}
      </Button>
    </form>
  );
}
