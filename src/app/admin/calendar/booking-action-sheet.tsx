"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { adminCancelBooking, adminConfirmBooking, adminMarkNoShow, adminVoidBooking, getBookingPaymentProof } from "./actions";
import { adminConfirmBookingGroup, getBookingGroupPending } from "@/app/admin/payments/actions";
import { RescheduleForm } from "./reschedule-sheet";

export function BookingActionSheet({
  open,
  onOpenChange,
  bookingId,
  label,
  startsAtIso,
  status,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  label: string;
  startsAtIso: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [proof, setProof] = useState<{ paymentReference: string | null; slipUrl: string | null } | null>(null);
  const [group, setGroup] = useState<{ groupId: string | null; pendingCount: number }>({ groupId: null, pendingCount: 0 });
  const [mode, setMode] = useState<"actions" | "reschedule" | "void">("actions");
  const [reason, setReason] = useState("");
  const isCart = group.groupId != null && group.pendingCount > 1;

  const hasStarted = startsAtIso !== "" && new Date(startsAtIso) <= new Date();
  const isPendingConfirmation = status === "pending";

  useEffect(() => {
    if (!open || !bookingId) {
      setProof(null);
      setGroup({ groupId: null, pendingCount: 0 });
      setMode("actions");
      setReason("");
      setError(null);
      return;
    }
    getBookingPaymentProof(bookingId).then(setProof);
    getBookingGroupPending(bookingId).then(setGroup);
  }, [open, bookingId]);

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await adminConfirmBooking(bookingId);
      if (!result.success) {
        setError(result.message);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  function onConfirmGroup() {
    if (!group.groupId) return;
    setError(null);
    startTransition(async () => {
      const result = await adminConfirmBookingGroup(group.groupId!);
      if (!result.success) {
        setError(result.error ?? "Couldn't confirm the cart.");
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  function onCancel() {
    setError(null);
    startTransition(async () => {
      const result = await adminCancelBooking(bookingId);
      if (!result.success) {
        setError(result.message);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  function onNoShow() {
    setError(null);
    startTransition(async () => {
      const result = await adminMarkNoShow(bookingId);
      if (!result.success) {
        setError(result.message);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  function onVoid() {
    setError(null);
    startTransition(async () => {
      const result = await adminVoidBooking(bookingId, reason);
      if (!result.success) {
        setError(result.message);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  if (!bookingId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md">
        {mode === "reschedule" ? (
          <RescheduleForm
            bookingId={bookingId}
            onBack={() => setMode("actions")}
            onDone={() => {
              onOpenChange(false);
              router.refresh();
            }}
          />
        ) : mode === "void" ? (
          <div className="flex flex-col gap-4 p-4">
            <SheetHeader className="p-0">
              <SheetTitle>Void booking</SheetTitle>
              <SheetDescription>
                Removes this booking from reports and frees its slot. It stays in the audit log with
                your reason. Use this for a mistaken entry or a past booking that shouldn&apos;t count —
                not for a customer cancelling ahead of time.
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="voidReason" className="text-sm font-medium">
                Reason
              </label>
              <textarea
                id="voidReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                autoFocus
                placeholder="e.g. Duplicate entry / entered on the wrong court"
                className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <SheetFooter className="flex-col gap-2 p-0 sm:flex-col">
              <Button variant="destructive" disabled={isPending || !reason.trim()} onClick={onVoid}>
                Void booking
              </Button>
              <Button variant="outline" disabled={isPending} onClick={() => { setMode("actions"); setError(null); }}>
                Back
              </Button>
            </SheetFooter>
          </div>
        ) : (
        <div className="flex flex-col gap-4 p-4">
          <SheetHeader className="p-0">
            <SheetTitle>{label}</SheetTitle>
            <SheetDescription>
              {isPendingConfirmation
                ? isCart
                  ? `1 of ${group.pendingCount} slots in one payment, awaiting confirmation.`
                  : "This booking is awaiting confirmation."
                : "What would you like to do with this booking?"}
            </SheetDescription>
          </SheetHeader>

          {proof && (proof.paymentReference || proof.slipUrl) && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Payment proof</p>
              {proof.paymentReference && (
                <p className="mt-1 text-muted-foreground">Reference: {proof.paymentReference}</p>
              )}
              {proof.slipUrl && (
                <a
                  href={proof.slipUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block underline underline-offset-2"
                >
                  View receipt
                </a>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <SheetFooter className="flex-col gap-2 p-0 sm:flex-col">
            {isPendingConfirmation && isCart && (
              <Button disabled={isPending} onClick={onConfirmGroup}>
                Confirm all {group.pendingCount} slots
              </Button>
            )}
            {isPendingConfirmation && (
              <Button variant={isCart ? "outline" : "default"} disabled={isPending} onClick={onConfirm}>
                {isCart ? "Confirm this slot only" : "Confirm booking"}
              </Button>
            )}
            {!isPendingConfirmation && hasStarted && (
              <Button variant="outline" disabled={isPending} onClick={onNoShow}>
                Mark as no-show
              </Button>
            )}
            {hasStarted && (
              <Button variant="destructive" disabled={isPending} onClick={() => { setMode("void"); setError(null); }}>
                Void booking
              </Button>
            )}
            {!hasStarted && (
              <Button variant="outline" disabled={isPending} onClick={() => setMode("reschedule")}>
                Reschedule
              </Button>
            )}
            {!hasStarted && (
              <Button variant="destructive" disabled={isPending} onClick={onCancel}>
                Cancel booking
              </Button>
            )}
          </SheetFooter>
        </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
