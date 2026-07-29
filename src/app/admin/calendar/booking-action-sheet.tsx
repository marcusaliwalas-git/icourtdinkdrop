"use client";

import { useState, useTransition } from "react";
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
import { adminCancelBooking, adminMarkNoShow } from "./actions";

export function BookingActionSheet({
  open,
  onOpenChange,
  bookingId,
  label,
  startsAtIso,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  label: string;
  startsAtIso: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasStarted = startsAtIso !== "" && new Date(startsAtIso) <= new Date();

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
            <SheetDescription>What would you like to do with this booking?</SheetDescription>
          </SheetHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <SheetFooter className="flex-col gap-2 p-0 sm:flex-col">
            {hasStarted && (
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
