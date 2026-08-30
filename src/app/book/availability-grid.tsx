"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatInTimezone } from "@/lib/time";
import { computeBookingTotalCents, type RatePeriod } from "@/lib/pricing";
import { BookingSheet, type CartSegment, type CoachOption, type PaymentAccount } from "./booking-sheet";
import type { TimeRow } from "@/lib/availability";

interface Court {
  id: string;
  name: string;
  hourly_rate_cents: number;
  member_rate_cents: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  available: "Open",
  booked: "Booked",
  closed: "Closed",
  past: "",
};

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

// Compact form for the tight grid cells: "₱600" (no centavos, rates are whole pesos).
function pesosCompact(cents: number) {
  return `₱${(cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

// A selected tile is keyed by court + row so a cart can span any mix of courts and times.
const cellKey = (courtId: string, rowIdx: number) => `${courtId}:${rowIdx}`;

// Rate tiers for open cells: cool = cheaper → warm = pricier, so a glance across the grid
// shows where the peak/premium slots are. Rates are mapped onto these steps by their position
// between the day's lowest and highest rate, so it adapts to any venue's pricing.
const RATE_TIERS = [
  "bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:hover:bg-teal-500/20",
  "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20",
  "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20",
  "bg-orange-50 text-orange-800 hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20",
  "bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20",
];
const RATE_TIER_SWATCH = ["bg-teal-400", "bg-emerald-400", "bg-amber-400", "bg-orange-400", "bg-rose-400"];

// Which tier a rate falls into. A single flat rate stays the familiar "available" green (tier 1).
function rateTierIndex(cents: number, minCents: number, maxCents: number): number {
  if (maxCents <= minCents) return 1;
  return Math.round(((cents - minCents) / (maxCents - minCents)) * (RATE_TIERS.length - 1));
}

export function AvailabilityGrid({
  timezone,
  courts,
  rows,
  courtIds,
  ratePeriodsByCourtId,
  coaches,
  paymentAccounts,
  isLoggedIn,
}: {
  timezone: string;
  courts: Court[];
  rows: TimeRow[];
  courtIds: string[];
  ratePeriodsByCourtId: Record<string, RatePeriod[]>;
  coaches: CoachOption[];
  paymentAccounts: PaymentAccount[];
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  useEffect(() => {
    if (courtIds.length === 0) return;
    const supabase = createClient();
    const channel = supabase
      .channel("booking-slots-availability")
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_slots" }, () => {
        // A slot appeared or freed up somewhere in view — refetch the server-rendered grid.
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtIds.join(",")]);

  // On a refresh, drop any selected tile that's no longer available (someone else booked it, or
  // time passed it by) so the cart can never submit a slot that isn't bookable. Skipped while
  // the sheet shows its confirmation — that refresh is the user's own booking flipping tiles to
  // "booked", not a race to warn them about.
  useEffect(() => {
    if (selected.size === 0 || bookingConfirmed) return;
    setSelected((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const key of prev) {
        const [courtId, rowStr] = key.split(":");
        if (rows[Number(rowStr)]?.cells[courtId] !== "available") {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, bookingConfirmed]);

  function toggleCell(courtId: string, rowIdx: number) {
    if (rows[rowIdx]?.cells[courtId] !== "available") return;
    setSelected((prev) => {
      const next = new Set(prev);
      const key = cellKey(courtId, rowIdx);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Group selected tiles into bookable segments: per court, contiguous runs of rows become one
  // booking; a gap starts a new one. This is what turns "any tiles" into "multiple bookings".
  const segments = useMemo<CartSegment[]>(() => {
    const byCourt = new Map<string, number[]>();
    for (const key of selected) {
      const [courtId, rowStr] = key.split(":");
      (byCourt.get(courtId) ?? byCourt.set(courtId, []).get(courtId)!).push(Number(rowStr));
    }

    const result: CartSegment[] = [];
    for (const court of courts) {
      const idxs = (byCourt.get(court.id) ?? []).sort((a, b) => a - b);
      let runStart: number | null = null;
      let prev: number | null = null;
      const flush = (start: number, end: number) => {
        const startsAtIso = rows[start].startsAtIso;
        const durationMinutes = (end - start + 1) * 60;
        const endLabel = formatInTimezone(
          new Date(new Date(rows[end].startsAtIso).getTime() + 60 * 60_000),
          "h:mm a",
          timezone
        );
        const estimateCents = computeBookingTotalCents({
          startsAtIso,
          durationMinutes,
          timezone,
          ratePeriods: ratePeriodsByCourtId[court.id] ?? [],
          baseHourlyRateCents: court.hourly_rate_cents,
          baseMemberRateCents: court.member_rate_cents,
          isMember: isLoggedIn,
        });
        result.push({
          courtId: court.id,
          courtName: court.name,
          startsAtIso,
          durationMinutes,
          label: `${rows[start].label} – ${endLabel}`,
          estimateCents,
        });
      };
      for (const idx of idxs) {
        if (runStart === null) {
          runStart = idx;
        } else if (prev !== null && idx !== prev + 1) {
          flush(runStart, prev);
          runStart = idx;
        }
        prev = idx;
      }
      if (runStart !== null && prev !== null) flush(runStart, prev);
    }
    // Chronological within the day, then by court, so the cart reads naturally.
    return result.sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso) || a.courtName.localeCompare(b.courtName));
  }, [selected, courts, rows, timezone, ratePeriodsByCourtId, isLoggedIn]);

  const totalCents = segments.reduce((sum, s) => sum + s.estimateCents, 0);
  const courtCount = new Set(segments.map((s) => s.courtId)).size;
  const slotCount = segments.reduce((sum, s) => sum + s.durationMinutes / 60, 0);

  // Per-hour price for every open cell — the court's rate for that hour, honouring time-of-day
  // rate periods and the member rate. Same computation as the cart total and the server, so the
  // number shown on a tile is exactly what that hour costs.
  const rateByCell = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, rowIdx) => {
      for (const court of courts) {
        if (row.cells[court.id] !== "available") continue;
        const cents = computeBookingTotalCents({
          startsAtIso: row.startsAtIso,
          durationMinutes: 60,
          timezone,
          ratePeriods: ratePeriodsByCourtId[court.id] ?? [],
          baseHourlyRateCents: court.hourly_rate_cents,
          baseMemberRateCents: court.member_rate_cents,
          isMember: isLoggedIn,
        });
        map.set(cellKey(court.id, rowIdx), cents);
      }
    });
    return map;
  }, [rows, courts, timezone, ratePeriodsByCourtId, isLoggedIn]);

  // Distinct rates present today, low→high, and the min/max used to place each on the tier scale.
  const distinctRates = useMemo(
    () => Array.from(new Set(rateByCell.values())).sort((a, b) => a - b),
    [rateByCell]
  );
  const minRate = distinctRates[0] ?? 0;
  const maxRate = distinctRates[distinctRates.length - 1] ?? 0;

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Each open slot shows its price per hour{isLoggedIn ? " (your member rate where it applies)" : ""}. Tap any
        slots — across courts and times — then review and book them together.
      </p>

      {distinctRates.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Rate:</span>
          {distinctRates.map((rate) => (
            <span key={rate} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-sm", RATE_TIER_SWATCH[rateTierIndex(rate, minRate, maxRate)])} />
              {pesosCompact(rate)}/hr
            </span>
          ))}
        </div>
      )}

      <div className={cn("overflow-x-auto rounded-md border", segments.length > 0 && "mb-24")}>
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-background p-2 text-left text-xs font-medium text-muted-foreground">
                Time
              </th>
              {courts.map((court) => (
                <th key={court.id} className="min-w-28 border-l p-2 text-left font-medium">
                  {court.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={row.startsAtIso} className="border-t">
                <td className="sticky left-0 z-10 bg-background p-2 text-xs whitespace-nowrap text-muted-foreground">
                  {row.label}
                  {row.nextDay && (
                    <span className="ml-1 rounded bg-primary/15 px-1 py-0.5 font-mono text-[0.6rem] text-primary">
                      +1 day
                    </span>
                  )}
                </td>
                {courts.map((court) => {
                  const status = row.cells[court.id];
                  const isAvailableCell = status === "available";
                  const isSelected = selected.has(cellKey(court.id, rowIdx));
                  const cents = rateByCell.get(cellKey(court.id, rowIdx));
                  const price = cents != null ? pesosCompact(cents) : undefined;
                  const tierClass = cents != null ? RATE_TIERS[rateTierIndex(cents, minRate, maxRate)] : "";
                  return (
                    <td key={court.id} className="border-l p-1 align-top">
                      <button
                        type="button"
                        disabled={!isAvailableCell}
                        onClick={() => toggleCell(court.id, rowIdx)}
                        aria-pressed={isSelected}
                        aria-label={`${court.name} at ${row.label}, ${
                          isAvailableCell ? `${price} per hour` : STATUS_LABEL[status] || "unavailable"
                        }${isSelected ? ", selected" : ""}`}
                        className={cn(
                          "h-11 w-full min-w-24 rounded-md text-xs font-medium transition-all duration-150",
                          isAvailableCell && tierClass,
                          status === "booked" && "bg-muted text-muted-foreground",
                          status === "closed" && "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
                          status === "past" && "bg-transparent text-transparent",
                          isSelected &&
                            "bg-primary text-primary-foreground shadow-[0_0_0_1px_rgba(159,206,32,0.5),0_0_20px_-4px_rgba(159,206,32,0.6)] hover:bg-primary hover:text-primary-foreground dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary dark:hover:text-primary-foreground"
                        )}
                      >
                        {isAvailableCell ? (
                          <span className="flex flex-col leading-tight">
                            <span>{price}</span>
                            {isSelected && <span className="text-[0.6rem] font-normal opacity-90">Selected</span>}
                          </span>
                        ) : (
                          STATUS_LABEL[status]
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {segments.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 p-4">
            <p className="text-sm">
              <span className="font-medium">
                {slotCount} hr{slotCount > 1 ? "s" : ""} · {courtCount} court{courtCount > 1 ? "s" : ""}
              </span>
              <span className="text-muted-foreground"> · {pesos(totalCents)}</span>
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button type="button" onClick={() => setSheetOpen(true)}>
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      <BookingSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setSelected(new Set());
            setBookingConfirmed(false);
          }
        }}
        onBookingConfirmed={() => setBookingConfirmed(true)}
        segments={segments}
        totalCents={totalCents}
        coaches={coaches}
        paymentAccounts={paymentAccounts}
        isLoggedIn={isLoggedIn}
      />
    </>
  );
}
