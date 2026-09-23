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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createWalkInBookings } from "./actions";
import { formatInTimezone } from "@/lib/time";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";
import type { WalkInSegment } from "./selection";

// Sentinel for "booked now, pays at the venue later" (Radix Select can't use an empty value).
const UNPAID = "unpaid";

export function WalkInBatchSheet({
  open,
  onOpenChange,
  segments,
  timezone,
  onBooked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segments: WalkInSegment[];
  timezone: string;
  onBooked: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [payment, setPayment] = useState<string>("cash");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName("");
    setPhone("");
    setPayment("cash");
    setRemarks("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createWalkInBookings({
        segments: segments.map((s) => ({
          courtId: s.courtId,
          startsAt: s.startsAt,
          durationMinutes: s.durationMinutes,
        })),
        guestName: name,
        guestPhone: phone,
        paymentMethod: payment === UNPAID ? null : payment,
        paymentRemarks: payment === "online" ? remarks : undefined,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      reset();
      onBooked();
      router.refresh();
    });
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const totalHours = segments.reduce((sum, s) => sum + s.durationMinutes / 60, 0);
  const courtCount = new Set(segments.map((s) => s.courtId)).size;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[90vh] max-w-md overflow-y-auto">
        <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4">
          <SheetHeader className="p-0">
            <SheetTitle>Book {segments.length} walk-in{segments.length === 1 ? "" : "s"}</SheetTitle>
            <SheetDescription>
              {courtCount} court{courtCount === 1 ? "" : "s"} · {totalHours} court-hour{totalHours === 1 ? "" : "s"} — one
              name and payment for the whole session.
            </SheetDescription>
          </SheetHeader>

          <ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
            {segments.map((s) => (
              <li key={`${s.courtId}-${s.startsAt}`} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="font-medium">{s.courtName}</span>
                <span className="text-muted-foreground">
                  {formatInTimezone(new Date(s.startsAt), "EEE, MMM d · h:mm a", timezone)} –{" "}
                  {formatInTimezone(new Date(s.endsAt), "h:mm a", timezone)}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wibName">Name</Label>
            <Input
              id="wibName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Open Play — Coach Ana"
              required
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wibPhone">Mobile number (optional)</Label>
            <Input id="wibPhone" placeholder="09171234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wibPayment">Payment</Label>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger id="wibPayment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
                <SelectItem value={UNPAID}>Not paid yet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {payment === "online" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wibRemarks">Bank & reference number</Label>
              <Input
                id="wibRemarks"
                placeholder="e.g. BPI · ref 1234567"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <SheetFooter className="p-0">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Booking…" : `Confirm ${segments.length} booking${segments.length === 1 ? "" : "s"}`}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
