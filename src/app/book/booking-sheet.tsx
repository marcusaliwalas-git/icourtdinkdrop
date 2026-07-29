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

interface Court {
  id: string;
  name: string;
  hourly_rate_cents: number;
  member_rate_cents: number | null;
}

const DURATIONS = [30, 60, 90, 120];

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
  const [duration, setDuration] = useState("60");
  const [partySize, setPartySize] = useState("2");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ referenceCode: string; whatsAppShareLink: string } | null>(
    null
  );
  const [isPending, startTransition] = useTransition();

  if (!court) return null;

  // Guests always pay the hourly rate; only a logged-in user might qualify for the member
  // rate (actual membership status is still verified server-side when the booking is created).
  const rateCents = isLoggedIn ? court.member_rate_cents ?? court.hourly_rate_cents : court.hourly_rate_cents;
  const estimateCents = Math.round((rateCents * Number(duration)) / 60);

  function handleClose(next: boolean) {
    if (!next) {
      setError(null);
      setConfirmation(null);
      setDuration("60");
      setGuestName("");
      setGuestPhone("");
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
        durationMinutes: Number(duration),
        partySize: Number(partySize),
        guestName: isLoggedIn ? undefined : guestName,
        guestPhone: isLoggedIn ? undefined : guestPhone,
        idempotencyKey: `${court!.id}-${startsAtIso}-${duration}-${Date.now()}`,
      });
      if (!result.success) {
        setError(result.message);
        if (result.code === "SLOT_TAKEN") {
          router.refresh();
        }
        return;
      }
      setConfirmation({ referenceCode: result.referenceCode, whatsAppShareLink: result.whatsAppShareLink });
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="mx-auto max-w-md">
        {confirmation ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <SheetTitle>Booking confirmed!</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Show this reference at the venue. Pay at the counter.
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
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} minutes
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
              </>
            )}

            <p className="text-sm text-muted-foreground">
              Estimated total: <span className="font-medium text-foreground">{pesos(estimateCents)}</span> — pay at
              venue. {isLoggedIn && court.member_rate_cents != null && "Member rate applied if you're an active member."}
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <SheetFooter className="p-0">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Booking..." : "Confirm booking"}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
