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
import { createWalkInBooking } from "./actions";
import { formatInTimezone } from "@/lib/time";
import { DURATION_HOURS, durationLabel } from "@/lib/booking-durations";

export function WalkInSheet({
  open,
  onOpenChange,
  courtId,
  courtName,
  startsAtIso,
  timezone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courtId: string;
  courtName: string;
  startsAtIso: string;
  timezone: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [durationHours, setDurationHours] = useState("1");
  const [partySize, setPartySize] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName("");
    setPhone("");
    setDurationHours("1");
    setPartySize("2");
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
        partySize: Number(partySize),
        guestName: name,
        guestPhone: phone,
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
            <Label htmlFor="wiPhone">Mobile number</Label>
            <Input
              id="wiPhone"
              placeholder="09171234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="wiParty">Party size</Label>
              <Input
                id="wiParty"
                type="number"
                min={1}
                max={20}
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                required
              />
            </div>
          </div>

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
