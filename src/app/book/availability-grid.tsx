"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatInTimezone } from "@/lib/time";
import { BookingSheet } from "./booking-sheet";
import type { TimeRow } from "@/lib/availability";

interface Court {
  id: string;
  name: string;
  hourly_rate_cents: number;
  member_rate_cents: number | null;
}

interface RatePeriod {
  start_time: string;
  end_time: string;
  hourly_rate_cents: number;
  member_rate_cents: number | null;
}

interface Selection {
  courtId: string;
  start: number;
  end: number;
}

const STATUS_LABEL: Record<string, string> = {
  available: "Open",
  booked: "Booked",
  closed: "Closed",
  past: "",
};

export function AvailabilityGrid({
  timezone,
  courts,
  rows,
  courtIds,
  ratePeriodsByCourtId,
  isLoggedIn,
}: {
  timezone: string;
  courts: Court[];
  rows: TimeRow[];
  courtIds: string[];
  ratePeriodsByCourtId: Record<string, RatePeriod[]>;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  useEffect(() => {
    if (courtIds.length === 0) return;
    const supabase = createClient();
    const channel = supabase
      .channel("booking-slots-availability")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_slots" },
        () => {
          // A slot appeared or freed up somewhere in view — refetch the server-rendered
          // grid rather than patch state locally, since booking_slots deletes only carry
          // the primary key (booking_id), not which court/time freed up.
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtIds.join(",")]);

  // If a refreshed grid no longer shows every tile in the current selection as available
  // (someone else booked into it, or time passed it by), drop the stale selection instead
  // of letting the user submit a range that's no longer bookable. Skipped once the sheet is
  // showing its own confirmation screen — that refresh is from the user's own just-completed
  // booking flipping their selected tiles to "booked", not a race to warn them about.
  useEffect(() => {
    if (!selection || bookingConfirmed) return;
    for (let i = selection.start; i <= selection.end; i++) {
      if (rows[i]?.cells[selection.courtId] !== "available") {
        setSelection(null);
        setSheetOpen(false);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, bookingConfirmed]);

  function isAvailable(rowIdx: number, courtId: string) {
    return rows[rowIdx]?.cells[courtId] === "available";
  }

  function handleCellClick(courtId: string, rowIdx: number) {
    setSelection((prev) => {
      if (!prev || prev.courtId !== courtId) {
        return { courtId, start: rowIdx, end: rowIdx };
      }
      if (rowIdx === prev.end && prev.start !== prev.end) {
        return { ...prev, end: rowIdx - 1 };
      }
      if (rowIdx === prev.start && prev.start !== prev.end) {
        return { ...prev, start: rowIdx + 1 };
      }
      if (rowIdx === prev.start && rowIdx === prev.end) {
        return null;
      }
      if (rowIdx === prev.end + 1 && isAvailable(rowIdx, courtId)) {
        return { ...prev, end: rowIdx };
      }
      if (rowIdx === prev.start - 1 && isAvailable(rowIdx, courtId)) {
        return { ...prev, start: rowIdx };
      }
      return { courtId, start: rowIdx, end: rowIdx };
    });
  }

  const selectedCourt = selection ? courts.find((c) => c.id === selection.courtId) ?? null : null;
  const selectionHours = selection ? selection.end - selection.start + 1 : 0;
  const selectionStartsAtIso = selection ? rows[selection.start]?.startsAtIso : "";
  const selectionEndLabel =
    selection && rows[selection.end]
      ? formatInTimezone(
          new Date(new Date(rows[selection.end].startsAtIso).getTime() + 60 * 60_000),
          "h:mm a",
          timezone
        )
      : "";

  return (
    <>
      <div className={cn("overflow-x-auto rounded-md border", selection && "mb-20")}>
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
                </td>
                {courts.map((court) => {
                  const status = row.cells[court.id];
                  const isAvailableCell = status === "available";
                  const isSelected =
                    selection !== null &&
                    selection.courtId === court.id &&
                    rowIdx >= selection.start &&
                    rowIdx <= selection.end;
                  return (
                    <td key={court.id} className="border-l p-1 align-top">
                      <button
                        type="button"
                        disabled={!isAvailableCell}
                        onClick={() => handleCellClick(court.id, rowIdx)}
                        aria-label={`${court.name} at ${row.label}, ${STATUS_LABEL[status] || "unavailable"}${isSelected ? ", selected" : ""}`}
                        className={cn(
                          "h-11 w-full min-w-24 rounded-md text-xs font-medium transition-all duration-150",
                          isAvailableCell && "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20",
                          status === "booked" && "bg-muted text-muted-foreground",
                          status === "closed" && "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
                          status === "past" && "bg-transparent text-transparent",
                          isSelected &&
                            "bg-primary text-primary-foreground shadow-[0_0_0_1px_rgba(159,206,32,0.5),0_0_20px_-4px_rgba(159,206,32,0.6)] hover:bg-primary hover:text-primary-foreground dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary dark:hover:text-primary-foreground"
                        )}
                      >
                        {STATUS_LABEL[status]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selection && selectedCourt && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 p-4">
            <p className="text-sm">
              <span className="font-medium">{selectedCourt.name}</span>
              <span className="text-muted-foreground">
                {" "}
                · {rows[selection.start]?.label}–{selectionEndLabel} · {selectionHours} hr
                {selectionHours > 1 ? "s" : ""}
              </span>
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setSelection(null)}>
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
            setSelection(null);
            setBookingConfirmed(false);
          }
        }}
        onBookingConfirmed={() => setBookingConfirmed(true)}
        court={selectedCourt}
        ratePeriods={selectedCourt ? ratePeriodsByCourtId[selectedCourt.id] ?? [] : []}
        startsAtIso={selectionStartsAtIso}
        durationMinutes={selectionHours * 60}
        timezone={timezone}
        isLoggedIn={isLoggedIn}
      />
    </>
  );
}
