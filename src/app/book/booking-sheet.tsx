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
import { buildIcs } from "@/lib/ics";

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

export interface CoachOption {
  id: string;
  name: string;
  hourly_rate_cents: number;
}

// A venue receiving account, shown so the customer knows where to transfer the fee.
export interface PaymentAccount {
  bank_name: string;
  account_name: string;
  account_number: string;
  remarks: string | null;
}

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

// The account number, click-to-copy with a brief "Copied" confirmation. The number is also
// select-all so it stays copyable by hand if the clipboard API is blocked.
function CopyableAccountNumber({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — the text stays selectable.
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy account number"
      className="inline-flex items-center gap-1.5 font-mono text-foreground transition-colors hover:text-primary"
    >
      <span className="select-all">{value}</span>
      <span className="font-sans text-xs text-muted-foreground">{copied ? "Copied ✓" : "Copy"}</span>
    </button>
  );
}

export function BookingSheet({
  open,
  onOpenChange,
  onBookingConfirmed,
  segments,
  totalCents,
  coaches,
  paymentAccounts,
  isLoggedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBookingConfirmed?: () => void;
  segments: CartSegment[];
  totalCents: number;
  coaches: CoachOption[];
  paymentAccounts: PaymentAccount[];
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [coachId, setCoachId] = useState("");
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

  // Coaching add-on: one coach for the whole cart, charged per hour across all slots.
  const totalMinutes = segments.reduce((sum, s) => sum + s.durationMinutes, 0);
  const selectedCoach = coaches.find((c) => c.id === coachId) ?? null;
  const coachFeeCents = selectedCoach ? Math.round((selectedCoach.hourly_rate_cents * totalMinutes) / 60) : 0;
  const grandTotalCents = totalCents + coachFeeCents;

  function handleClose(next: boolean) {
    if (!next) {
      setError(null);
      setConfirmation(null);
      setCoachId("");
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
        guestName: isLoggedIn ? undefined : guestName,
        guestPhone: isLoggedIn ? undefined : guestPhone,
        guestEmail: isLoggedIn ? undefined : guestEmail || undefined,
        coachId: coachId || null,
        paymentReference: paymentReference.trim() || undefined,
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

  // Build an .ics for the confirmed bookings and hand it to the browser as a download, so the
  // customer can add every slot to their own calendar in one tap.
  function downloadCalendar() {
    if (!confirmation) return;
    const ics = buildIcs(
      confirmation.bookings.map((b) => ({
        uid: `${b.referenceCode}@dinkdrop`,
        start: new Date(b.startsAtIso),
        end: new Date(b.endsAtIso),
        title: `Pickleball — ${b.courtName}`,
        description: `Booking reference: ${b.referenceCode}`,
      })),
      { calendarName: "DinkDrop bookings" }
    );
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = confirmation.bookings.length > 1 ? "dinkdrop-bookings.ics" : "dinkdrop-booking.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
            <Button type="button" variant="outline" onClick={downloadCalendar} className="w-full">
              Add to calendar
            </Button>
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
              {selectedCoach && (
                <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">Coaching — {selectedCoach.name}</span>
                    <span className="text-muted-foreground"> · {totalMinutes / 60} hr</span>
                  </span>
                  <span className="text-muted-foreground">{pesos(coachFeeCents)}</span>
                </li>
              )}
            </ul>

            {coaches.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coach">Add a coach (optional)</Label>
                <select id="coach" className={selectClass} value={coachId} onChange={(e) => setCoachId(e.target.value)}>
                  <option value="">No coach</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {pesos(c.hourly_rate_cents)}/hr
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!isLoggedIn && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="guestName">Your name</Label>
                  <Input id="guestName" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="guestPhone">Mobile number (optional)</Label>
                  <Input
                    id="guestPhone"
                    placeholder="09171234567"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
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
              Total: <span className="font-medium text-foreground">{pesos(grandTotalCents)}</span>
              {selectedCoach ? ` (courts ${pesos(totalCents)} + coach ${pesos(coachFeeCents)})` : ""}.{" "}
              {isLoggedIn && "Member rates applied if you're an active member. "}
              Transfer this amount via GCash or bank transfer, then attach proof below (reference number optional).
            </p>

            {paymentAccounts.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Send payment to
                </p>
                {paymentAccounts.map((acct, i) => (
                  <div key={i} className="text-sm">
                    <p className="font-medium">{acct.bank_name}</p>
                    <p className="text-muted-foreground">{acct.account_name}</p>
                    <CopyableAccountNumber value={acct.account_number} />
                    {acct.remarks && <p className="text-xs text-muted-foreground">{acct.remarks}</p>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paymentReference">Payment reference number (optional)</Label>
              <Input
                id="paymentReference"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g. GCash reference number"
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
