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
import { createBooking } from "./actions";
import { formatInTimezone } from "@/lib/time";
import { DURATION_HOURS, durationLabel } from "@/lib/booking-durations";

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
  court,
  startsAtIso,
  timezone,
  isLoggedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  court: Court | null;
  startsAtIso: string;
  timezone: string;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [durationHours, setDurationHours] = useState("1");
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

  // Guests always pay the hourly rate; only a logged-in user might qualify for the member
  // rate (actual membership status is still verified server-side when the booking is created).
  const rateCents = isLoggedIn ? court.member_rate_cents ?? court.hourly_rate_cents : court.hourly_rate_cents;
  const estimateCents = Math.round(rateCents * Number(durationHours));

  function handleClose(next: boolean) {
    if (!next) {
      setError(null);
      setConfirmation(null);
      setDurationHours("1");
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
        durationMinutes: Number(durationHours) * 60,
        partySize: Number(partySize),
        guestName: isLoggedIn ? undefined : guestName,
        guestPhone: isLoggedIn ? undefined : guestPhone,
        guestEmail: isLoggedIn ? undefined : guestEmail || undefined,
        idempotencyKey: `${court!.id}-${startsAtIso}-${durationHours}-${Date.now()}`,
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
                {startsAtIso && formatInTimezone(new Date(startsAtIso), "EEEE, MMM d 'at' h:mm a", timezone)}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="duration">Duration</Label>
              <Select value={durationHours} onValueChange={setDurationHours}>
                <SelectTrigger id="duration">
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
