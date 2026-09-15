"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { AdminTimeRow } from "@/lib/availability";
import { WalkInSheet } from "./walk-in-sheet";
import { BookingActionSheet } from "./booking-action-sheet";

interface Court {
  id: string;
  name: string;
}

const HOUR_W = 68; // px per hour column
const COURT_W = 150; // px for the sticky court-name column

type Segment =
  | { kind: "booked"; start: number; span: number; bookingId: string; label: string; status: string; startIso: string }
  | { kind: "closed"; start: number; span: number }
  | { kind: "available" | "past"; start: number; span: 1; startIso: string };

/** Collapse a court's per-hour grid cells (from buildAdminCalendarGrid) into timeline segments:
 * consecutive cells of one booking become one block, consecutive closures one block, and open/past
 * hours stay single so each is individually clickable. Positions are just the row index, since the
 * rows are contiguous whole hours. */
function segmentsFor(rows: AdminTimeRow[], courtId: string): Segment[] {
  const segs: Segment[] = [];
  let i = 0;
  while (i < rows.length) {
    const cell = rows[i].cells[courtId];
    if (cell?.status === "booked" && cell.bookingId) {
      let j = i;
      while (
        j + 1 < rows.length &&
        rows[j + 1].cells[courtId]?.status === "booked" &&
        rows[j + 1].cells[courtId]?.bookingId === cell.bookingId
      )
        j++;
      segs.push({
        kind: "booked",
        start: i,
        span: j - i + 1,
        bookingId: cell.bookingId,
        label: cell.label ?? "Booking",
        status: cell.bookingStatus ?? "confirmed",
        startIso: rows[i].startsAtIso,
      });
      i = j + 1;
    } else if (cell?.status === "closed") {
      let j = i;
      while (j + 1 < rows.length && rows[j + 1].cells[courtId]?.status === "closed") j++;
      segs.push({ kind: "closed", start: i, span: j - i + 1 });
      i = j + 1;
    } else {
      segs.push({ kind: (cell?.status as "available" | "past") ?? "available", start: i, span: 1, startIso: rows[i].startsAtIso });
      i++;
    }
  }
  return segs;
}

export function CalendarTimeline({ timezone, courts, rows }: { timezone: string; courts: Court[]; rows: AdminTimeRow[] }) {
  const [selectedSlot, setSelectedSlot] = useState<{ courtId: string; courtName: string; startsAtIso: string } | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<{ id: string; label: string; startsAtIso: string; status: string } | null>(null);

  const segsByCourt = useMemo(
    () => Object.fromEntries(courts.map((c) => [c.id, segmentsFor(rows, c.id)])),
    [courts, rows]
  );

  // "Now" marker as a fractional row index, from the real clock. Null (hidden) until mounted and
  // only when now falls within the day's rendered window — avoids a hydration mismatch.
  const [nowLeft, setNowLeft] = useState<number | null>(null);
  useEffect(() => {
    function compute() {
      if (rows.length === 0) return setNowLeft(null);
      const now = Date.now();
      const first = new Date(rows[0].startsAtIso).getTime();
      const end = new Date(rows[rows.length - 1].startsAtIso).getTime() + 3_600_000;
      if (now < first || now > end) return setNowLeft(null);
      setNowLeft(COURT_W + ((now - first) / 3_600_000) * HOUR_W);
    }
    compute();
    const t = setInterval(compute, 60_000);
    return () => clearInterval(t);
  }, [rows]);

  const trackWidth = rows.length * HOUR_W;
  const firstNextDay = rows.findIndex((r) => r.nextDay);

  return (
    <>
      <div className="overflow-auto rounded-md border" style={{ maxHeight: "74vh" }}>
        <div style={{ width: COURT_W + trackWidth, position: "relative" }}>
          {/* header */}
          <div className="sticky top-0 z-20 flex bg-background">
            <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-b bg-background px-3 text-xs font-medium text-muted-foreground" style={{ width: COURT_W, height: 40 }}>
              Court
            </div>
            <div className="flex border-b" style={{ width: trackWidth }}>
              {rows.map((row) => (
                <div key={row.startsAtIso} className="shrink-0 border-l border-border/40 px-2 text-[0.65rem] leading-10 text-muted-foreground" style={{ width: HOUR_W }}>
                  {row.label}
                </div>
              ))}
            </div>
          </div>

          {/* rows */}
          {courts.map((court) => (
            <div key={court.id} className="flex border-b border-border/40">
              <div className="sticky left-0 z-10 flex shrink-0 items-center border-r bg-background px-3 text-sm font-medium" style={{ width: COURT_W, height: 52 }}>
                <span className="truncate">{court.name}</span>
              </div>
              <div
                className="relative shrink-0"
                style={{
                  width: trackWidth,
                  height: 52,
                  backgroundImage: `repeating-linear-gradient(90deg, var(--border) 0 1px, transparent 1px ${HOUR_W}px)`,
                }}
              >
                {segsByCourt[court.id].map((seg, idx) => {
                  const left = seg.start * HOUR_W;
                  const width = seg.span * HOUR_W;
                  if (seg.kind === "booked") {
                    const pending = seg.status === "pending";
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedBooking({ id: seg.bookingId, label: seg.label, startsAtIso: seg.startIso, status: seg.status })}
                        title={pending ? "Pending confirmation" : "View booking"}
                        className={cn(
                          "absolute top-1.5 bottom-1.5 truncate rounded-md border px-2 text-left text-xs font-medium",
                          pending
                            ? "border-yellow-500/40 bg-yellow-100 text-yellow-900 hover:bg-yellow-200 dark:bg-yellow-950 dark:text-yellow-200"
                            : "border-border bg-muted text-foreground hover:bg-muted/70"
                        )}
                        style={{ left: left + 2, width: width - 4 }}
                      >
                        {seg.label}
                        {pending && " (pending)"}
                      </button>
                    );
                  }
                  if (seg.kind === "closed") {
                    return (
                      <div
                        key={idx}
                        className="absolute top-1.5 bottom-1.5 rounded-md text-center text-[0.7rem] leading-9 text-amber-700 dark:text-amber-300"
                        style={{ left: left + 2, width: width - 4, backgroundImage: "repeating-linear-gradient(45deg, rgba(217,165,74,0.12) 0 6px, transparent 6px 12px)" }}
                      >
                        Closed
                      </div>
                    );
                  }
                  const isPast = seg.kind === "past";
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedSlot({ courtId: court.id, courtName: court.name, startsAtIso: seg.startIso })}
                      title={isPast ? "Add a missed booking for this past slot" : "Add a walk-in"}
                      className={cn(
                        "absolute top-1.5 bottom-1.5 rounded-md text-xs font-medium",
                        isPast
                          ? "text-muted-foreground/50 hover:bg-muted hover:text-foreground"
                          : "text-emerald-700/70 hover:bg-emerald-50 dark:text-emerald-300/70 dark:hover:bg-emerald-950"
                      )}
                      style={{ left: left + 2, width: width - 4 }}
                    >
                      {isPast ? "+" : "+ Walk-in"}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* next-day boundary + now line, spanning all rows */}
          {firstNextDay > 0 && (
            <div className="pointer-events-none absolute top-0 bottom-0 border-l border-primary/40" style={{ left: COURT_W + firstNextDay * HOUR_W, zIndex: 15 }} />
          )}
          {nowLeft !== null && (
            <div className="pointer-events-none absolute top-10 bottom-0 border-l-2 border-primary" style={{ left: nowLeft, zIndex: 15 }}>
              <span className="absolute -top-0.5 -left-1 h-2 w-2 rounded-full bg-primary" />
            </div>
          )}
        </div>
      </div>

      <WalkInSheet
        open={selectedSlot !== null}
        onOpenChange={(open) => !open && setSelectedSlot(null)}
        courtId={selectedSlot?.courtId ?? ""}
        courtName={selectedSlot?.courtName ?? ""}
        startsAtIso={selectedSlot?.startsAtIso ?? ""}
        timezone={timezone}
      />
      <BookingActionSheet
        open={selectedBooking !== null}
        onOpenChange={(open) => !open && setSelectedBooking(null)}
        bookingId={selectedBooking?.id ?? ""}
        label={selectedBooking?.label ?? ""}
        startsAtIso={selectedBooking?.startsAtIso ?? ""}
        status={selectedBooking?.status ?? "confirmed"}
      />
    </>
  );
}
