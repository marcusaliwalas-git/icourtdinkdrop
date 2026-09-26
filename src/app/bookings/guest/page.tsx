"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { lookupBookingByReference, type GuestBookingLookup } from "../actions";
import { formatInTimezone } from "@/lib/time";

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  confirmed: "default",
  cancelled: "secondary",
  completed: "secondary",
  no_show: "destructive",
  pending: "secondary",
};

export default function GuestBookingLookupPage() {
  const [code, setCode] = useState("");
  const [booking, setBooking] = useState<GuestBookingLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await lookupBookingByReference(code);
      if ("error" in result) {
        setError(result.error);
        setBooking(null);
      } else {
        setBooking(result.booking);
      }
    });
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="mb-1 text-xl font-semibold">Manage your booking</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter the reference code from your confirmation.
      </p>

      <form onSubmit={onLookup} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Reference code</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            required
            className="tracking-widest"
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Looking up..." : "Find booking"}
        </Button>
      </form>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {booking && (
        <Card className="mt-4">
          <CardContent className="flex flex-col gap-2 py-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{booking.court_name}</p>
              <Badge variant={STATUS_VARIANT[booking.status] ?? "secondary"}>
                {booking.status === "pending" ? "Awaiting confirmation" : booking.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatInTimezone(new Date(booking.starts_at), "EEE, MMM d 'at' h:mm a")} –{" "}
              {formatInTimezone(new Date(booking.ends_at), "h:mm a")}
            </p>
            <p className="text-xs text-muted-foreground">
              {pesos(booking.total_cents)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Need to change or cancel this booking? Contact the venue.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
