"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminConfirmBookingGroup, adminRejectBookingGroup } from "./actions";
import { adminConfirmBooking, adminCancelBooking } from "@/app/admin/calendar/actions";

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

type Slot = { courtName: string; when: string };

/** Result shape differs between the group actions ({error}) and the single-booking actions
 * ({message}); normalise to one string. */
function errorOf(r: { error?: string; message?: string }): string {
  return r.error ?? r.message ?? "Something went wrong.";
}

export function PaymentGroupCard({
  groupId,
  firstBookingId,
  customer,
  contact,
  slots,
  totalCents,
  referenceCode,
  paymentReference,
  slipUrl,
}: {
  groupId: string | null;
  firstBookingId: string;
  customer: string;
  contact: string | null;
  slots: Slot[];
  totalCents: number;
  referenceCode: string;
  paymentReference: string | null;
  slipUrl: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = groupId ? await adminConfirmBookingGroup(groupId) : await adminConfirmBooking(firstBookingId);
      if (!res.success) return setError(errorOf(res));
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const res = groupId
        ? await adminRejectBookingGroup(groupId, reason)
        : await adminCancelBooking(firstBookingId, reason);
      if (!res.success) return setError(errorOf(res));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium">{customer}</span>
          {contact && <span className="text-xs text-muted-foreground">{contact}</span>}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] tracking-wide text-muted-foreground uppercase">
            {slots.length} slot{slots.length === 1 ? "" : "s"}
          </span>
        </div>

        <ul className="flex flex-col gap-1 text-sm">
          {slots.map((s, i) => (
            <li key={i} className="flex flex-wrap gap-x-2 text-muted-foreground">
              <span className="text-foreground">{s.courtName}</span>
              <span>{s.when}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-semibold">Total {pesos(totalCents)}</span>
          <span className="font-mono text-xs text-muted-foreground">Ref {referenceCode}</span>
          {paymentReference && (
            <span className="text-xs text-muted-foreground">Payment ref: {paymentReference}</span>
          )}
          {slipUrl && (
            <a href={slipUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
              View proof ↗
            </a>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex shrink-0 flex-col gap-2 sm:w-64 sm:items-stretch">
        {rejecting ? (
          <>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional) — sent to the customer"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={reject} disabled={isPending}>
                {isPending ? "…" : "Confirm reject"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={isPending}>
                Back
              </Button>
            </div>
          </>
        ) : (
          <div className="flex gap-2 sm:justify-end">
            <Button size="sm" onClick={confirm} disabled={isPending}>
              {isPending ? "…" : `Confirm${slots.length > 1 ? " all" : ""}`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setError(null);
                setReason("");
                setRejecting(true);
              }}
              disabled={isPending}
            >
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
