"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatInTimezone } from "@/lib/time";
import {
  adminConfirmBooking,
  adminMarkNoShow,
  adminSetCheckedIn,
  getBookingPaymentProof,
} from "@/app/admin/calendar/actions";
import { ViewReceiptButton } from "@/app/admin/calendar/view-receipt-button";

export type DeskBooking = {
  id: string;
  status: string;
  checkedIn: boolean;
  startIso: string;
  endIso: string;
  courtName: string;
  customerName: string;
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
  const [proof, setProof] = useState<{ paymentReference: string | null; hasSlip: boolean } | null>(null);
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
                className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border p-3 sm:flex-nowrap"
              >
                <div className="w-28 shrink-0">
                  <p className="font-medium">{time(b.startIso)}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.courtName} · {b.partySize} {b.partySize === 1 ? "player" : "players"}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.customerName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{b.referenceCode}</span>
                    {b.phone ? ` · ${b.phone}` : ""} · {pesos(b.totalCents)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
                      <Button size="sm" disabled={isPending} onClick={() => run(() => adminSetCheckedIn(b.id, true))}>
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
          ) : !proof.paymentReference && !proof.hasSlip ? (
            <p className="text-sm text-muted-foreground">No payment proof was submitted.</p>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              {proof.paymentReference && (
                <p>
                  Reference: <span className="font-mono">{proof.paymentReference}</span>
                </p>
              )}
              {proofFor && proof.hasSlip && <ViewReceiptButton bookingId={proofFor.id} />}
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
