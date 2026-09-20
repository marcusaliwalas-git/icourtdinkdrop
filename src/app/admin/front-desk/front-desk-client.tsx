"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatInTimezone } from "@/lib/time";
import { isPaid, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-methods";
import {
  adminConfirmBooking,
  adminMarkNoShow,
  adminSetCheckedIn,
  getBookingPaymentProof,
  setBookingPayment,
} from "@/app/admin/calendar/actions";

export type DeskBooking = {
  id: string;
  status: string;
  checkedIn: boolean;
  startIso: string;
  endIso: string;
  courtName: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  partySize: number;
  totalCents: number;
  paymentStatus: string;
  referenceCode: string;
  isOnline: boolean;
};

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

/** Record how an unpaid walk-in settled at the desk (cash / online / complimentary) before check-in.
 * Marking it paid flips the entry's outline from red to green. */
function MarkPaid({
  disabled,
  onMark,
}: {
  disabled: boolean;
  onMark: (method: PaymentMethod) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Payment method"
        value={method}
        onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        disabled={disabled}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
      >
        {PAYMENT_METHODS.map((m) => (
          <option key={m} value={m} className="bg-card text-foreground">
            {PAYMENT_METHOD_LABELS[m]}
          </option>
        ))}
      </select>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => onMark(method)}>
        Mark paid
      </Button>
    </div>
  );
}

export function FrontDesk({
  bookings,
  timezone,
  dateLabel,
}: {
  bookings: DeskBooking[];
  timezone: string;
  dateLabel: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proofFor, setProofFor] = useState<DeskBooking | null>(null);
  const [proof, setProof] = useState<{ paymentReference: string | null; slipUrl: string | null } | null>(null);
  // Grouping needs "now", but computing it during render would risk a hydration mismatch — so it
  // starts null (server + first client render agree: one flat list) and is set after mount, then
  // ticked every minute so rows move between "now / coming up / earlier" on their own.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const confirmedCount = bookings.filter((b) => b.status === "confirmed").length;
  const arrivedCount = bookings.filter((b) => b.checkedIn).length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return bookings;
    return bookings.filter((b) =>
      [b.customerName, b.referenceCode, b.phone ?? ""].some((f) => f.toLowerCase().includes(needle))
    );
  }, [q, bookings]);

  const groups = useMemo(() => {
    if (now === null) return [{ key: "all", label: "Today", rows: filtered }];
    const nowMs = now;
    const nowRows: DeskBooking[] = [];
    const upcomingRows: DeskBooking[] = [];
    const earlierRows: DeskBooking[] = [];
    for (const b of filtered) {
      const start = new Date(b.startIso).getTime();
      const end = new Date(b.endIso).getTime();
      if (start <= nowMs && nowMs < end) nowRows.push(b);
      else if (start > nowMs) upcomingRows.push(b);
      else earlierRows.push(b);
    }
    return [
      { key: "now", label: "Happening now", rows: nowRows },
      { key: "upcoming", label: "Coming up", rows: upcomingRows },
      { key: "earlier", label: "Earlier today", rows: earlierRows },
    ].filter((g) => g.rows.length > 0);
  }, [filtered, now]);

  function run(fn: () => Promise<{ success: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) setError(result.message ?? "Something went wrong.");
      else router.refresh();
    });
  }

  function openProof(b: DeskBooking) {
    setProofFor(b);
    setProof(null);
    getBookingPaymentProof(b.id).then(setProof);
  }

  const time = (iso: string) => formatInTimezone(new Date(iso), "h:mm a", timezone);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Front desk</h1>
          <p className="text-sm text-muted-foreground">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
            {arrivedCount} of {confirmedCount} checked in
          </span>
          <Link
            href="/admin/calendar"
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            + Walk-in
          </Link>
        </div>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, reference code, or phone"
        className="h-11 text-base"
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {bookings.length === 0 ? "No bookings for today yet." : "No matches — try a different name or code."}
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-2">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.label}</h2>
            {g.rows.map((b) => (
              <div
                key={b.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border-2 p-3 sm:flex-nowrap",
                  // Green outline once paid, red while payment is still owed — a glanceable status.
                  isPaid(b.paymentStatus) ? "border-emerald-500/70" : "border-destructive/70"
                )}
              >
                <div className="w-28 shrink-0">
                  <p className="font-medium">{time(b.startIso)}</p>
                  <p className="text-xs text-muted-foreground">{b.courtName}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {b.customerName}
                    {b.email ? <span className="text-muted-foreground"> ({b.email})</span> : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{b.referenceCode}</span>
                    {b.phone ? ` · ${b.phone}` : ""} · {pesos(b.totalCents)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {/* Unpaid walk-in/admin slots can be settled at the desk before check-in; online
                      bookings still go through the payment-proof + Confirm flow. */}
                  {!b.checkedIn && !b.isOnline && !isPaid(b.paymentStatus) && (
                    <MarkPaid
                      disabled={isPending}
                      onMark={(method) => run(() => setBookingPayment({ bookingId: b.id, paymentMethod: method }))}
                    />
                  )}
                  {b.checkedIn ? (
                    <>
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                        Arrived
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => run(() => adminSetCheckedIn(b.id, false))}
                      >
                        Undo
                      </Button>
                    </>
                  ) : b.status === "pending" ? (
                    <>
                      <Badge variant="outline">Needs payment check</Badge>
                      {b.isOnline && (
                        <Button variant="outline" size="sm" disabled={isPending} onClick={() => openProof(b)}>
                          Payment
                        </Button>
                      )}
                      <Button size="sm" disabled={isPending} onClick={() => run(() => adminConfirmBooking(b.id))}>
                        Confirm
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => run(() => adminMarkNoShow(b.id))}
                      >
                        No-show
                      </Button>
                      <Button
                        size="sm"
                        // No check-in until the booking is settled — mark payment (above) first.
                        disabled={isPending || !isPaid(b.paymentStatus)}
                        title={isPaid(b.paymentStatus) ? undefined : "Record payment before checking in"}
                        onClick={() => run(() => adminSetCheckedIn(b.id, true))}
                      >
                        Check in
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      <Dialog open={proofFor !== null} onOpenChange={(open) => !open && setProofFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Payment — {proofFor?.customerName}</DialogTitle>
          </DialogHeader>
          {proof === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !proof.paymentReference && !proof.slipUrl ? (
            <p className="text-sm text-muted-foreground">No payment proof was submitted.</p>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              {proof.paymentReference && (
                <p>
                  Reference: <span className="font-mono">{proof.paymentReference}</span>
                </p>
              )}
              {proof.slipUrl && (
                <a
                  href={proof.slipUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  View receipt
                </a>
              )}
            </div>
          )}
          {proofFor?.status === "pending" && (
            <Button
              disabled={isPending}
              onClick={() => {
                const id = proofFor.id;
                setProofFor(null);
                run(() => adminConfirmBooking(id));
              }}
            >
              Confirm booking
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
