"use client";

import { useMemo, useState, useTransition } from "react";
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
import { formatInTimezone } from "@/lib/time";
import { DURATION_HOURS, durationLabel } from "@/lib/booking-durations";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";
import { computeBookingTotalCents } from "@/lib/pricing";
import { evaluatePromotions, toPromoRow, totalDiscountCents, type PromoRowInput } from "@/lib/promos/engine";
import { type CourtPricing } from "./calendar-views";

// Sentinel for "booked now, pays at the venue later" (Radix Select can't use an empty value).
const UNPAID = "unpaid";

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
  promotions,
  pricing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courtId: string;
  courtName: string;
  startsAtIso: string;
  timezone: string;
  venueId: string;
  promotions: PromoRowInput[];
  pricing: Record<string, CourtPricing>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [durationHours, setDurationHours] = useState("1");
  const [payment, setPayment] = useState<string>("cash");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Price + any promo discount for the chosen duration, so staff collect the right amount. Walk-ins
  // have no booker, so they're never "member" for pricing/eligibility — mirrors the server.
  const { baseCents, discountCents } = useMemo(() => {
    const p = pricing[courtId];
    if (!p || !startsAtIso) return { baseCents: 0, discountCents: 0 };
    const durationMinutes = Number(durationHours) * 60;
    const base = computeBookingTotalCents({
      startsAtIso,
      durationMinutes,
      timezone,
      ratePeriods: p.ratePeriods,
      baseHourlyRateCents: p.baseHourlyRateCents,
      baseMemberRateCents: null,
      isMember: false,
    });
    let discount = 0;
    if (promotions.length > 0) {
      const onDateIso = formatInTimezone(new Date(startsAtIso), "yyyy-MM-dd", timezone);
      const lines = evaluatePromotions(
        {
          venueId,
          timezone,
          isMember: false,
          onDateIso,
          segments: [{ courtId, startsAtIso, durationMinutes, baseTotalCents: base }],
        },
        promotions.map(toPromoRow)
      );
      discount = totalDiscountCents(lines);
    }
    return { baseCents: base, discountCents: discount };
  }, [pricing, courtId, startsAtIso, durationHours, timezone, promotions, venueId]);
  const netCents = baseCents - discountCents;

  function reset() {
    setName("");
    setPhone("");
    setDurationHours("1");
    setPayment("cash");
    setRemarks("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createWalkInBooking({
        courtId,
        startsAt: startsAtIso,
        durationMinutes: Number(durationHours) * 60,
        guestName: name,
        guestPhone: phone,
        paymentMethod: payment === UNPAID ? undefined : payment,
        paymentRemarks: payment === "online" ? remarks : undefined,
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

          {baseCents > 0 && (
            <p className="text-sm text-muted-foreground">
              Total: <span className="font-medium text-foreground">{pesos(netCents)}</span>
              {discountCents > 0 && (
                <span className="text-xs"> ({pesos(baseCents)} − promo {pesos(discountCents)})</span>
              )}
            </p>
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
