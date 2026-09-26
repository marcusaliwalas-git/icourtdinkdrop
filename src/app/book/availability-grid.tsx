"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
// between the day's lowest and highest rate, so it adapts to any venue's pricing. The ramp stops
// at orange and deliberately avoids red — red reads as "unavailable/error", not "premium".
const RATE_TIERS = [
  "bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20",
  "bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:hover:bg-teal-500/20",
  "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20",
  "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20",
  "bg-orange-50 text-orange-800 hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20",
];
const RATE_TIER_SWATCH = ["bg-sky-400", "bg-teal-400", "bg-emerald-400", "bg-amber-400", "bg-orange-400"];

// The tier a flat (single) rate lands on — the familiar "available" green, now the middle of the
// ramp. Keep this in sync with the emerald entry's index above.
const FLAT_RATE_TIER = 2;

// Which tier a rate falls into. A single flat rate stays the familiar "available" green.
function rateTierIndex(cents: number, minCents: number, maxCents: number): number {
  if (maxCents <= minCents) return FLAT_RATE_TIER;
  return Math.round(((cents - minCents) / (maxCents - minCents)) * (RATE_TIERS.length - 1));
}

type GuestView = "grid" | "timeline" | "find";
const VIEW_STORAGE_KEY = "book-calendar-view";
const GUEST_VIEWS: { key: GuestView; label: string }[] = [
  { key: "grid", label: "Grid" },
  { key: "timeline", label: "Timeline" },
  { key: "find", label: "Find a time" },
];
const GUEST_DURATIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const TL_HOUR_W = 78; // px per hour column in the timeline
const TL_COURT_W = 132; // px for the sticky court column

export function AvailabilityGrid({
  timezone,
  courts,
  rows,
  courtIds,
  ratePeriodsByCourtId,
  coaches,
  paymentAccounts,
  isLoggedIn,
  defaultView,
}: {
  timezone: string;
  courts: Court[];
  rows: TimeRow[];
  courtIds: string[];
  ratePeriodsByCourtId: Record<string, RatePeriod[]>;
  coaches: CoachOption[];
  paymentAccounts: PaymentAccount[];
  isLoggedIn: boolean;
  /** The venue's default calendar view; a booker's own saved choice overrides it. */
  defaultView: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  // View switcher (grid / timeline / find a time). Starts on the venue default (matches SSR), then
  // adopts this browser's remembered choice once mounted.
  const [view, setView] = useState<GuestView>(defaultView === "timeline" || defaultView === "find" ? defaultView : "grid");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "grid" || saved === "timeline" || saved === "find") setView(saved);
    } catch {
      /* ignore */
    }
  }, []);
  function chooseView(v: GuestView) {
    setView(v);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }
  // Find-a-time inputs.
  const [findStart, setFindStart] = useState(0);
  const [findDuration, setFindDuration] = useState(1);

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

  // Add a whole window of open hours on one court to the cart (used by Find a time).
  function selectRange(courtId: string, startIdx: number, dur: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (let i = startIdx; i < startIdx + dur; i++) {
        if (rows[i]?.cells[courtId] === "available") next.add(cellKey(courtId, i));
      }
      return next;
    });
  }

  // One slot button — shared by the grid and the timeline so their behaviour never diverges. Open
  // slots show the per-hour price and toggle into the cart; booked/closed/past are inert.
  function renderCell(court: Court, rowIdx: number) {
    const status = rows[rowIdx]?.cells[court.id];
    const isAvailableCell = status === "available";
    const isSelected = selected.has(cellKey(court.id, rowIdx));
    const cents = rateByCell.get(cellKey(court.id, rowIdx));
    const price = cents != null ? pesosCompact(cents) : undefined;
    const tierClass = cents != null ? RATE_TIERS[rateTierIndex(cents, minRate, maxRate)] : "";
    return (
      <button
        type="button"
        disabled={!isAvailableCell}
        onClick={() => toggleCell(court.id, rowIdx)}
        aria-pressed={isSelected}
        aria-label={`${court.name} at ${rows[rowIdx]?.label}, ${
          isAvailableCell ? `${price} per hour` : STATUS_LABEL[status] || "unavailable"
        }${isSelected ? ", selected" : ""}`}
        className={cn(
          "h-11 w-full rounded-md text-xs font-medium transition-all duration-150",
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
    );
  }

  // Find a time: for the chosen start + duration, which courts are free (and the window's price).
  const findResults = courts.map((court) => {
    if (findStart + findDuration > rows.length) return { court, available: false as const, reason: "Outside hours" };
    let cents = 0;
    let ok = true;
    for (let i = findStart; i < findStart + findDuration; i++) {
      if (rows[i]?.cells[court.id] !== "available") { ok = false; break; }
      cents += rateByCell.get(cellKey(court.id, i)) ?? 0;
    }
    if (ok) return { court, available: true as const, cents };
    const win = rows.slice(findStart, findStart + findDuration).map((r) => r.cells[court.id]);
    const reason = win.includes("booked") ? "Booked" : win.includes("closed") ? "Closed" : "Past";
    return { court, available: false as const, reason };
  });
  const findOpen = findResults.filter((r): r is { court: Court; available: true; cents: number } => r.available);

  return (
    <>
      <div className="inline-flex w-fit gap-1 rounded-full border border-input bg-background p-1">
        {GUEST_VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => chooseView(v.key)}
            aria-pressed={view === v.key}
            className={cn(
              "rounded-full px-3 py-1 text-sm transition-colors",
              view === v.key ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {view === "find"
          ? "Pick a start time and how long you want to play — we'll show the open courts and their price."
          : `Each open slot shows its price per hour${isLoggedIn ? " (your member rate where it applies)" : ""}. Tap any slots — across courts and times — then review and book them together.`}
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

      {view !== "find" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-primary/50 bg-primary/30" /> Selected</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-muted" /> Booked</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-amber-50 dark:bg-amber-500/20" /> Closed</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-dashed border-border" /> Past</span>
        </div>
      )}

      {view === "grid" && (
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
            {rows.map((row, rowIdx) => {
              // One full-width divider at the midnight boundary: the first slot on the next calendar
              // day. Everything below it is that day (its date is on the divider).
              const startsNextDay = row.nextDay && (rowIdx === 0 || !rows[rowIdx - 1].nextDay);
              return (
              <Fragment key={row.startsAtIso}>
              {startsNextDay && (
                <tr>
                  <td
                    colSpan={courts.length + 1}
                    className="border-t bg-muted/40 px-2 py-1.5 text-xs font-medium tracking-wide text-muted-foreground"
                  >
                    {formatInTimezone(new Date(row.startsAtIso), "EEEE, MMMM d", timezone)} →
                  </td>
                </tr>
              )}
              <tr className="border-t">
                <td className="sticky left-0 z-10 bg-background p-2 whitespace-nowrap">
                  <span className="text-xs font-medium text-foreground">{row.label}</span>
                  <span className="block text-[0.65rem] text-muted-foreground">– {row.endLabel}</span>
                </td>
                {courts.map((court) => (
                  <td key={court.id} className="border-l p-1 align-top min-w-24">
                    {renderCell(court, rowIdx)}
                  </td>
                ))}
              </tr>
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {view === "timeline" && (
        <div className={cn("overflow-auto rounded-md border", segments.length > 0 && "mb-24")} style={{ maxHeight: "70vh" }}>
          <div style={{ width: TL_COURT_W + rows.length * TL_HOUR_W, position: "relative" }}>
            <div className="sticky top-0 z-20 flex bg-background">
              <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-b bg-background px-3 text-xs font-medium text-muted-foreground" style={{ width: TL_COURT_W, height: 36 }}>
                Court
              </div>
              <div className="flex border-b">
                {rows.map((r) => (
                  <div key={r.startsAtIso} className="shrink-0 border-l border-border/40 px-2 text-[0.65rem] leading-9 text-muted-foreground" style={{ width: TL_HOUR_W }}>
                    {r.label}
                    {r.nextDay ? " +1" : ""}
                  </div>
                ))}
              </div>
            </div>
            {courts.map((court) => (
              <div key={court.id} className="flex border-b border-border/40">
                <div className="sticky left-0 z-10 flex shrink-0 items-center border-r bg-background px-3 text-sm font-medium" style={{ width: TL_COURT_W, height: 52 }}>
                  <span className="truncate">{court.name}</span>
                </div>
                <div className="flex">
                  {rows.map((r, rowIdx) => (
                    <div key={r.startsAtIso} className="shrink-0 p-1" style={{ width: TL_HOUR_W }}>
                      {renderCell(court, rowIdx)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "find" && (
        <div className={cn("flex flex-col gap-4", segments.length > 0 && "mb-24")}>
          <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bfStart" className="text-sm font-medium">Start time</label>
              <select
                id="bfStart"
                value={findStart}
                onChange={(e) => setFindStart(Number(e.target.value))}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {rows.map((r, i) => (
                  <option key={r.startsAtIso} value={i}>
                    {r.label}
                    {r.nextDay ? " (+1 day)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bfDur" className="text-sm font-medium">Duration</label>
              <select
                id="bfDur"
                value={findDuration}
                onChange={(e) => setFindDuration(Number(e.target.value))}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {GUEST_DURATIONS.map((h) => (
                  <option key={h} value={h}>
                    {h} {h === 1 ? "hour" : "hours"}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-muted-foreground">
              {rows[findStart]?.label}
              {rows[findStart + findDuration - 1]?.endLabel ? `–${rows[findStart + findDuration - 1].endLabel}` : ""}
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium">
              {findOpen.length} of {courts.length} {findOpen.length === 1 ? "court" : "courts"} available
            </h2>
            {findOpen.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No courts are free for that window. Try another time or a shorter duration.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/60 rounded-md border">
                {findOpen.map(({ court, cents }) => (
                  <li key={court.id} className="flex items-center justify-between gap-3 p-3">
                    <span className="font-medium">{court.name}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">{pesos(cents)}</span>
                      <Button size="sm" onClick={() => selectRange(court.id, findStart, findDuration)}>
                        Add
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

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
        timezone={timezone}
      />
    </>
  );
}
