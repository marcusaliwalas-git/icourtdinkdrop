"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { upsertVenue } from "./actions";

type Venue = {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  timezone: string;
  contact: string | null;
  email_from: string | null;
  min_lead_minutes: number;
  max_advance_days: number;
  cancellation_cutoff_hours: number;
} | null;

const ACCEPTED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function VenueDetailsForm({ venue }: { venue: Venue }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string>(venue?.logo_url ?? "");
  const [uploading, setUploading] = useState(false);

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setMessage("That logo is too large — please use one under 2MB.");
      e.target.value = "";
      return;
    }
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      setMessage("Use a PNG, JPG, WebP, or SVG image (HEIC isn't supported).");
      e.target.value = "";
      return;
    }
    setMessage(null);
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("venue-logos").upload(path, file, { contentType: file.type });
    if (error) {
      setMessage(`Couldn't upload the logo: ${error.message}`);
      setUploading(false);
      return;
    }
    setLogoUrl(supabase.storage.from("venue-logos").getPublicUrl(path).data.publicUrl);
    setUploading(false);
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await upsertVenue(venue?.id ?? null, formData);
      setMessage(result.error ?? "Saved");
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="logoUrl" value={logoUrl} />
      <div className="flex flex-col gap-1.5">
        <Label>Logo</Label>
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">None</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Input type="file" accept={ACCEPTED_LOGO_TYPES.join(",")} onChange={onLogoChange} className="w-auto" />
            <span className="text-xs text-muted-foreground">
              {uploading ? "Uploading…" : "Shown in your site header. PNG/SVG with transparency looks best."}
            </span>
          </div>
          {logoUrl && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl("")}>
              Remove
            </Button>
          )}
        </div>
      </div>
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
        <Label htmlFor="emailFrom">Sender email</Label>
        <Input
          id="emailFrom"
          name="emailFrom"
          type="email"
          placeholder="bookings@yourvenue.com"
          defaultValue={venue?.email_from ?? ""}
        />
        <p className="text-xs text-muted-foreground">
          Address your booking emails are sent from. Must be on a domain you&rsquo;ve verified in Resend. Leave blank to
          use the platform default.
        </p>
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
