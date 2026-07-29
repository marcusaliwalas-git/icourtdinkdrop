"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertVenue } from "./actions";

type Venue = {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  contact: string | null;
  min_lead_minutes: number;
  max_advance_days: number;
  cancellation_cutoff_hours: number;
} | null;

export function VenueDetailsForm({ venue }: { venue: Venue }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await upsertVenue(venue?.id ?? null, formData);
      setMessage(result.error ?? "Saved");
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Venue name</Label>
        <Input id="name" name="name" defaultValue={venue?.name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={venue?.address ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact">Contact number</Label>
        <Input id="contact" name="contact" defaultValue={venue?.contact ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">Timezone</Label>
        <Input id="timezone" name="timezone" defaultValue={venue?.timezone ?? "Asia/Manila"} required />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="minLeadMinutes">Min lead (min)</Label>
          <Input
            id="minLeadMinutes"
            name="minLeadMinutes"
            type="number"
            min={0}
            defaultValue={venue?.min_lead_minutes ?? 60}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="maxAdvanceDays">Booking window (days)</Label>
          <Input
            id="maxAdvanceDays"
            name="maxAdvanceDays"
            type="number"
            min={1}
            defaultValue={venue?.max_advance_days ?? 14}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cancellationCutoffHours">Free cancel until (hrs before)</Label>
          <Input
            id="cancellationCutoffHours"
            name="cancellationCutoffHours"
            type="number"
            min={0}
            defaultValue={venue?.cancellation_cutoff_hours ?? 3}
            required
          />
        </div>
      </div>
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Saving..." : venue ? "Save changes" : "Create venue"}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </form>
  );
}
