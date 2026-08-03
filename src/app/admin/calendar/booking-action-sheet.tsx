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
import { adminCancelBooking, adminConfirmBooking, adminMarkNoShow, getBookingPaymentProof } from "./actions";

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

  const hasStarted = startsAtIso !== "" && new Date(startsAtIso) <= new Date();
  const isPendingConfirmation = status === "pending";

  useEffect(() => {
    if (!open || !bookingId) {
      setProof(null);
      return;
    }
    getBookingPaymentProof(bookingId).then(setProof);
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

  if (!bookingId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md">
        <div className="flex flex-col gap-4 p-4">
          <SheetHeader className="p-0">
            <SheetTitle>{label}</SheetTitle>
            <SheetDescription>
              {isPendingConfirmation
                ? "This booking is awaiting confirmation."
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
            {isPendingConfirmation && (
              <Button disabled={isPending} onClick={onConfirm}>
                Confirm booking
              </Button>
            )}
            {!isPendingConfirmation && hasStarted && (
              <Button variant="outline" disabled={isPending} onClick={onNoShow}>
                Mark as no-show
              </Button>
            )}
            <Button variant="destructive" disabled={isPending} onClick={onCancel}>
              Cancel booking
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
