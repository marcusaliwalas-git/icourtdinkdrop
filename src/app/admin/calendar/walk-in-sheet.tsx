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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createWalkInBooking } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { formatInTimezone } from "@/lib/time";
import { DURATION_HOURS, durationLabel } from "@/lib/booking-durations";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";

// Sentinel for "booked now, pays at the venue later" (Radix Select can't use an empty value).
const UNPAID = "unpaid";

// One rentable item + units free for the chosen slot. Walk-ins are non-member → standard rate.
interface EquipItem {
  id: string;
  name: string;
  hourly_rate_cents: number;
  max_per_booking: number | null;
  available: number;
}

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export function WalkInSheet({
  open,
  onOpenChange,
  courtId,
  courtName,
  startsAtIso,
  timezone,
  venueId,
  equipmentEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courtId: string;
  courtName: string;
  startsAtIso: string;
  timezone: string;
  venueId: string;
  equipmentEnabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [durationHours, setDurationHours] = useState("1");
  const [payment, setPayment] = useState<string>("cash");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [equipItems, setEquipItems] = useState<EquipItem[]>([]);
  const [equipQty, setEquipQty] = useState<Record<string, number>>({});

  const durationMinutes = Number(durationHours) * 60;

  // Availability for this slot's range, re-fetched when the sheet opens or the duration changes.
  const rangeKey = startsAtIso ? `["${startsAtIso}","${new Date(new Date(startsAtIso).getTime() + durationMinutes * 60_000).toISOString()}")` : "";
  useEffect(() => {
    if (!open || !equipmentEnabled || !rangeKey) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("equipment_availability", { p_venue: venueId, p_range: rangeKey });
      if (!cancelled) setEquipItems((data ?? []) as EquipItem[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, equipmentEnabled, venueId, rangeKey]);

  const equipLines = equipItems
    .map((item) => ({ item, qty: equipQty[item.id] ?? 0 }))
    .filter((l) => l.qty > 0)
    .map((l) => ({ ...l, feeCents: Math.round((l.item.hourly_rate_cents * l.qty * durationMinutes) / 60) }));
  const equipmentFeeCents = equipLines.reduce((sum, l) => sum + l.feeCents, 0);

  function setQty(item: EquipItem, next: number) {
    const cap = Math.min(item.available, item.max_per_booking ?? item.available);
    setEquipQty((prev) => ({ ...prev, [item.id]: Math.max(0, Math.min(next, cap)) }));
  }

  function reset() {
    setName("");
    setPhone("");
    setDurationHours("1");
    setPayment("cash");
    setRemarks("");
    setError(null);
    setEquipQty({});
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createWalkInBooking({
        courtId,
        startsAt: startsAtIso,
        durationMinutes,
        guestName: name,
        guestPhone: phone,
        paymentMethod: payment === UNPAID ? undefined : payment,
        paymentRemarks: payment === "online" ? remarks : undefined,
        equipment: equipLines.map((l) => ({ equipmentId: l.item.id, quantity: l.qty })),
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  if (!courtId) return null;

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4">
          <SheetHeader className="p-0">
            <SheetTitle>Walk-in booking — {courtName}</SheetTitle>
            <SheetDescription>
              {startsAtIso && formatInTimezone(new Date(startsAtIso), "EEEE, MMM d 'at' h:mm a", timezone)}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wiName">Name</Label>
            <Input id="wiName" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wiPhone">Mobile number (optional)</Label>
            <Input
              id="wiPhone"
              placeholder="09171234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wiDuration">Duration</Label>
            <Select value={durationHours} onValueChange={setDurationHours}>
              <SelectTrigger id="wiDuration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_HOURS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {durationLabel(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wiPayment">Payment</Label>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger id="wiPayment">
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
              <Label htmlFor="wiRemarks">Bank & reference number</Label>
              <Input
                id="wiRemarks"
                placeholder="e.g. BPI · ref 1234567"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          )}

          {equipmentEnabled && equipItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Add equipment (optional)</Label>
              <ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
                {equipItems.map((item) => {
                  const qty = equipQty[item.id] ?? 0;
                  const cap = Math.min(item.available, item.max_per_booking ?? item.available);
                  const soldOut = item.available <= 0;
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        <span className="font-medium">{item.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {pesos(item.hourly_rate_cents)}/hr ·{" "}
                          {soldOut ? "none free for this time" : `${item.available} available`}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Button type="button" variant="outline" size="icon" className="size-7" disabled={qty <= 0} onClick={() => setQty(item, qty - 1)} aria-label={`Fewer ${item.name}`}>
                          −
                        </Button>
                        <span className="w-5 text-center tabular-nums">{qty}</span>
                        <Button type="button" variant="outline" size="icon" className="size-7" disabled={qty >= cap} onClick={() => setQty(item, qty + 1)} aria-label={`More ${item.name}`}>
                          +
                        </Button>
                      </span>
                    </li>
                  );
                })}
                {equipmentFeeCents > 0 && (
                  <li className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2 font-medium">
                    <span>Equipment</span>
                    <span>{pesos(equipmentFeeCents)}</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <SheetFooter className="p-0">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Booking..." : "Confirm walk-in"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
