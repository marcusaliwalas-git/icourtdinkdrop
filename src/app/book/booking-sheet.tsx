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
import { createBookings, type CreatedBooking } from "./actions";
import { createClient } from "@/lib/supabase/client";

const MAX_SLIP_BYTES = 5 * 1024 * 1024;
const ACCEPTED_SLIP_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

// One bookable slot in the cart: a court + start + whole-hour duration, with its price estimate
// and a display label. Built by the grid from the selected tiles.
export interface CartSegment {
  courtId: string;
  courtName: string;
  startsAtIso: string;
  durationMinutes: number;
  label: string;
  estimateCents: number;
}

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export function BookingSheet({
  open,
  onOpenChange,
  onBookingConfirmed,
  segments,
  totalCents,
  isLoggedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBookingConfirmed?: () => void;
  segments: CartSegment[];
  totalCents: number;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [partySize, setPartySize] = useState("2");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentSlipFile, setPaymentSlipFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    bookings: CreatedBooking[];
    status: string;
    whatsAppShareLink: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (segments.length === 0 && !confirmation) return null;

  function handleClose(next: boolean) {
    if (!next) {
      setError(null);
      setConfirmation(null);
      setGuestName("");
      setGuestPhone("");
      setGuestEmail("");
      setPaymentReference("");
      setPaymentSlipFile(null);
    }
    onOpenChange(next);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!paymentSlipFile) {
      setError("Attach a screenshot or photo of your payment receipt.");
      return;
    }

    startTransition(async () => {
      const ext = paymentSlipFile.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("payment-slips")
        .upload(path, paymentSlipFile, { contentType: paymentSlipFile.type });

      if (uploadError) {
        setError("Couldn't upload your receipt. Please try again.");
        return;
      }

      const result = await createBookings({
        segments: segments.map((s) => ({
          courtId: s.courtId,
          startsAt: s.startsAtIso,
          durationMinutes: s.durationMinutes,
        })),
        partySize: Number(partySize),
        guestName: isLoggedIn ? undefined : guestName,
        guestPhone: isLoggedIn ? undefined : guestPhone,
        guestEmail: isLoggedIn ? undefined : guestEmail || undefined,
        paymentReference,
        paymentSlipPath: path,
        idempotencyKey: `cart-${segments.map((s) => `${s.courtId}@${s.startsAtIso}`).join(",")}-${Date.now()}`,
      });

      if (!result.success) {
        setError(result.message);
        if (result.code === "SLOT_TAKEN") router.refresh();
        return;
      }
      setConfirmation({
        bookings: result.bookings,
        status: result.status,
        whatsAppShareLink: result.whatsAppShareLink,
      });
      onBookingConfirmed?.();
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="mx-auto max-w-md overflow-y-auto max-h-[92svh]">
        {confirmation ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <SheetTitle>
              {confirmation.status === "pending" ? "Booking requested!" : "Booking confirmed!"}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {confirmation.status === "pending"
                ? "The venue will confirm once they verify your payment. We'll email you either way."
                : "Show these references at the venue."}
            </p>
            <div className="flex w-full flex-col gap-1.5">
              {confirmation.bookings.map((b) => (
                <p key={b.bookingId} className="rounded-md border bg-muted px-4 py-2 font-mono text-sm tracking-widest">
                  {b.referenceCode}
                </p>
              ))}
            </div>
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
              <SheetTitle>Review your booking</SheetTitle>
              <SheetDescription>
                {segments.length} slot{segments.length > 1 ? "s" : ""} — pay once for all of them.
              </SheetDescription>
            </SheetHeader>

            <ul className="flex flex-col divide-y divide-border/60 rounded-md border">
              {segments.map((s) => (
                <li key={`${s.courtId}-${s.startsAtIso}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{s.courtName}</span>
                    <span className="text-muted-foreground"> · {s.label}</span>
                  </span>
                  <span className="text-muted-foreground">{pesos(s.estimateCents)}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="partySize">Party size (per court)</Label>
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
                  <Input id="guestName" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
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
                  <Label htmlFor="guestEmail">Email</Label>
                  <Input
                    id="guestEmail"
                    type="email"
                    placeholder="you@example.com"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    We&apos;ll email you when your booking is submitted, confirmed, or cancelled.
                  </p>
                </div>
              </>
            )}

            <p className="text-sm text-muted-foreground">
              Total: <span className="font-medium text-foreground">{pesos(totalCents)}</span>.{" "}
              {isLoggedIn && "Member rates applied if you're an active member. "}
              Transfer this amount via GCash or bank transfer, then enter your reference number and attach proof below.
            </p>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paymentReference">Payment reference number</Label>
              <Input
                id="paymentReference"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g. GCash reference number"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paymentSlip">Proof of payment</Label>
              <Input
                id="paymentSlip"
                type="file"
                accept={ACCEPTED_SLIP_TYPES.join(",")}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && file.size > MAX_SLIP_BYTES) {
                    setError("That file is too large — please attach something under 5MB.");
                    e.target.value = "";
                    setPaymentSlipFile(null);
                    return;
                  }
                  setError(null);
                  setPaymentSlipFile(file);
                }}
                required
              />
              <p className="text-xs text-muted-foreground">
                One receipt for the whole total. Screenshot or photo of your GCash/bank transfer.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <SheetFooter className="p-0">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Requesting..." : `Request ${segments.length} booking${segments.length > 1 ? "s" : ""}`}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
