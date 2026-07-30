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
import { createBooking } from "./actions";
import { formatInTimezone } from "@/lib/time";
import { computeBookingTotalCents, type RatePeriod } from "@/lib/pricing";

interface Court {
  id: string;
  name: string;
  hourly_rate_cents: number;
  member_rate_cents: number | null;
}

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export function BookingSheet({
  open,
  onOpenChange,
  onBookingConfirmed,
  court,
  ratePeriods,
  startsAtIso,
  durationMinutes,
  timezone,
  isLoggedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBookingConfirmed?: () => void;
  court: Court | null;
  ratePeriods: RatePeriod[];
  startsAtIso: string;
  durationMinutes: number;
  timezone: string;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [partySize, setPartySize] = useState("2");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    referenceCode: string;
    status: string;
    whatsAppShareLink: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!court) return null;

  const durationHours = durationMinutes / 60;
  const endsAtIso = startsAtIso
    ? new Date(new Date(startsAtIso).getTime() + durationMinutes * 60_000).toISOString()
    : "";

  // Guests always pay the guest rate; only a logged-in user might qualify for the member
  // rate (actual membership status is still verified server-side when the booking is created).
  // Mirrors create_booking's per-hour pricing exactly, so this estimate always matches what
  // gets charged — including courts with different rates at different times of day.
  const estimateCents = startsAtIso
    ? computeBookingTotalCents({
        startsAtIso,
        durationMinutes,
        timezone,
        ratePeriods,
        baseHourlyRateCents: court.hourly_rate_cents,
        baseMemberRateCents: court.member_rate_cents,
        isMember: isLoggedIn,
      })
    : 0;

  function handleClose(next: boolean) {
    if (!next) {
      setError(null);
      setConfirmation(null);
      setGuestName("");
      setGuestPhone("");
      setGuestEmail("");
    }
    onOpenChange(next);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createBooking({
        courtId: court!.id,
        startsAt: startsAtIso,
        durationMinutes,
        partySize: Number(partySize),
        guestName: isLoggedIn ? undefined : guestName,
        guestPhone: isLoggedIn ? undefined : guestPhone,
        guestEmail: isLoggedIn ? undefined : guestEmail || undefined,
        idempotencyKey: `${court!.id}-${startsAtIso}-${durationMinutes}-${Date.now()}`,
      });
      if (!result.success) {
        setError(result.message);
        if (result.code === "SLOT_TAKEN") {
          router.refresh();
        }
        return;
      }
      setConfirmation({
        referenceCode: result.referenceCode,
        status: result.status,
        whatsAppShareLink: result.whatsAppShareLink,
      });
      onBookingConfirmed?.();
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="mx-auto max-w-md">
        {confirmation ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <SheetTitle>
              {confirmation.status === "pending" ? "Booking requested!" : "Booking confirmed!"}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {confirmation.status === "pending"
                ? "The venue will confirm your booking shortly. Show this reference at the venue and pay at the counter."
                : "Show this reference at the venue. Pay at the counter."}
            </p>
            <p className="rounded-md border bg-muted px-4 py-2 font-mono text-lg tracking-widest">
              {confirmation.referenceCode}
            </p>
            <a
              href={confirmation.whatsAppShareLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline underline-offset-2"
            >
              Share via WhatsApp
            </a>
            <Button onClick={() => handleClose(false)}>Done</Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4">
            <SheetHeader className="p-0">
              <SheetTitle>{court.name}</SheetTitle>
              <SheetDescription>
                {startsAtIso && endsAtIso && (
                  <>
                    {formatInTimezone(new Date(startsAtIso), "EEEE, MMM d", timezone)}
                    {" · "}
                    {formatInTimezone(new Date(startsAtIso), "h:mm a", timezone)}
                    {"–"}
                    {formatInTimezone(new Date(endsAtIso), "h:mm a", timezone)}
                    {" · "}
                    {durationHours} hr{durationHours > 1 ? "s" : ""}
                  </>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="partySize">Party size</Label>
              <Input
                id="partySize"
                type="number"
                min={1}
                max={20}
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                required
              />
            </div>

            {!isLoggedIn && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="guestName">Your name</Label>
                  <Input
                    id="guestName"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="guestPhone">Mobile number</Label>
                  <Input
                    id="guestPhone"
                    placeholder="09171234567"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="guestEmail">Email (optional)</Label>
                  <Input
                    id="guestEmail"
                    type="email"
                    placeholder="you@example.com"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    We&apos;ll email you when your booking is submitted and confirmed.
                  </p>
                </div>
              </>
            )}

            <p className="text-sm text-muted-foreground">
              Estimated total: <span className="font-medium text-foreground">{pesos(estimateCents)}</span> — pay at
              venue. {isLoggedIn && court.member_rate_cents != null && "Member rate applied if you're an active member."}{" "}
              The venue will confirm your booking before it&apos;s final.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <SheetFooter className="p-0">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Requesting..." : "Request booking"}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
