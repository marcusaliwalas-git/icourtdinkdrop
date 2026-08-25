"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRescheduleContext, adminRescheduleBooking, type RescheduleContext } from "./actions";
import { computeBookingTotalCents } from "@/lib/pricing";
import { localDateTimeToUtc, formatInTimezone } from "@/lib/time";

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

function minutesToHHMM(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function minutesToLabel(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 && h < 24 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

/** Adds `days` to a yyyy-MM-dd string via a UTC-noon anchor (DST-safe, same pattern the admin
 * calendar uses). */
function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inner reschedule content (no Sheet wrapper) — rendered inside BookingActionSheet's sheet
 * when the admin switches to reschedule mode, so it shares the same bottom sheet rather than
 * stacking a second one (which would unmount when the parent selection clears). */
export function RescheduleForm({
  bookingId,
  onBack,
  onDone,
}: {
  bookingId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [ctx, setCtx] = useState<RescheduleContext | null>(null);
  const [date, setDate] = useState("");
  const [startMinutes, setStartMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!bookingId) {
      setCtx(null);
      setError(null);
      return;
    }
    getRescheduleContext(bookingId).then((c) => {
      setCtx(c);
      if (c) {
        // Pre-fill with the booking's current date + start.
        const localDate = formatInTimezone(new Date(c.currentStartIso), "yyyy-MM-dd", c.timezone);
        const localHhmm = formatInTimezone(new Date(c.currentStartIso), "HH:mm", c.timezone);
        const [h, m] = localHhmm.split(":").map(Number);
        setDate(localDate);
        setStartMinutes(h * 60 + m);
      }
    });
  }, [bookingId]);

  const today = ctx ? formatInTimezone(new Date(), "yyyy-MM-dd", ctx.timezone) : "";
  const maxDate = ctx ? addDaysToDateStr(today, ctx.maxAdvanceDays) : "";

  // Whole-hour start options within the chosen day's operating window that leave room for the
  // full (unchanged) duration before close. Anchored to open_time, stepping by 60 — matching
  // the booking grid. Server still validates availability/closures authoritatively on submit.
  const startOptions = useMemo(() => {
    if (!ctx || !date) return [];
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const hours = ctx.operatingHours.find((h) => h.dayOfWeek === weekday);
    if (!hours) return [];
    const options: number[] = [];
    for (let m = hours.openMinutes; m + ctx.durationMinutes <= hours.closeMinutes; m += 60) {
      options.push(m);
    }
    return options;
  }, [ctx, date]);

  // Reset the time if it's no longer valid for the chosen date.
  useEffect(() => {
    if (startMinutes != null && startOptions.length && !startOptions.includes(startMinutes)) {
      setStartMinutes(null);
    }
  }, [startOptions, startMinutes]);

  const newStartIso =
    ctx && date && startMinutes != null
      ? localDateTimeToUtc(date, minutesToHHMM(startMinutes), ctx.timezone).toISOString()
      : null;

  const newPriceCents =
    ctx && newStartIso
      ? computeBookingTotalCents({
          startsAtIso: newStartIso,
          durationMinutes: ctx.durationMinutes,
          timezone: ctx.timezone,
          ratePeriods: ctx.ratePeriods,
          baseHourlyRateCents: ctx.baseHourlyRateCents,
          baseMemberRateCents: ctx.baseMemberRateCents,
          isMember: ctx.isMember,
        })
      : null;

  const diffCents = ctx && newPriceCents != null ? newPriceCents - ctx.currentTotalCents : 0;
  const endLabel =
    ctx && newStartIso
      ? formatInTimezone(new Date(new Date(newStartIso).getTime() + ctx.durationMinutes * 60000), "h:mm a", ctx.timezone)
      : "";

  function onConfirm() {
    if (!ctx || !newStartIso) return;
    setError(null);
    startTransition(async () => {
      const result = await adminRescheduleBooking(bookingId, ctx.courtId, newStartIso);
      if (!result.success) {
        setError(result.message);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
          <SheetHeader className="p-0">
            <SheetTitle>Reschedule booking</SheetTitle>
            <SheetDescription>
              {ctx ? `${ctx.courtName} · ${ctx.durationMinutes / 60} hr — pick a new date and time.` : "Loading…"}
            </SheetDescription>
          </SheetHeader>

          {ctx && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reschedule-date">New date</Label>
                <Input
                  id="reschedule-date"
                  type="date"
                  value={date}
                  min={today}
                  max={maxDate}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reschedule-time">New start time</Label>
                <select
                  id="reschedule-time"
                  value={startMinutes ?? ""}
                  onChange={(e) => setStartMinutes(e.target.value === "" ? null : Number(e.target.value))}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
                >
                  <option value="" className="bg-card text-foreground">
                    {startOptions.length ? "Select a time" : "Closed on this day"}
                  </option>
                  {startOptions.map((m) => (
                    <option key={m} value={m} className="bg-card text-foreground">
                      {minutesToLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              {newStartIso && newPriceCents != null && (
                <div className="rounded-md border p-3 text-sm">
                  <p>
                    Moving to{" "}
                    <span className="font-medium">
                      {formatInTimezone(new Date(newStartIso), "EEE, MMM d · h:mm a", ctx.timezone)}–{endLabel}
                    </span>
                  </p>
                  {diffCents > 0 ? (
                    <p className="mt-1 text-primary">
                      New total {pesos(newPriceCents)} — collect {pesos(diffCents)} more before confirming.
                    </p>
                  ) : diffCents < 0 ? (
                    <p className="mt-1 text-muted-foreground">
                      Cheaper slot — total stays {pesos(ctx.currentTotalCents)} ({pesos(-diffCents)} difference not
                      refunded).
                    </p>
                  ) : (
                    <p className="mt-1 text-muted-foreground">Same price — {pesos(ctx.currentTotalCents)}, nothing to collect.</p>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <SheetFooter className="flex-col gap-2 p-0 sm:flex-col">
                <Button disabled={isPending || !newStartIso} onClick={onConfirm}>
                  {isPending ? "Rescheduling…" : "Confirm reschedule"}
                </Button>
                <Button type="button" variant="ghost" disabled={isPending} onClick={onBack}>
                  Back
                </Button>
              </SheetFooter>
            </>
          )}
        </div>
  );
}
