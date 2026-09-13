"use client";

import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import { formatInTimezone } from "@/lib/time";
import type { AdminTimeRow } from "@/lib/availability";
import { WalkInSheet } from "./walk-in-sheet";
import { BookingActionSheet } from "./booking-action-sheet";

interface Court {
  id: string;
  name: string;
}

export function CalendarGrid({
  timezone,
  courts,
  rows,
}: {
  timezone: string;
  courts: Court[];
  rows: AdminTimeRow[];
}) {
  const [selectedSlot, setSelectedSlot] = useState<{ courtId: string; courtName: string; startsAtIso: string } | null>(
    null
  );
  const [selectedBooking, setSelectedBooking] = useState<{
    id: string;
    label: string;
    startsAtIso: string;
    status: string;
  } | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-background p-2 text-left text-xs font-medium text-muted-foreground">
                Time
              </th>
              {courts.map((court) => (
                <th key={court.id} className="min-w-32 border-l p-2 text-left font-medium">
                  {court.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              // One full-width divider at the midnight boundary: the first slot that spills into the
              // next calendar day. Everything below it is that day (its date is on the divider).
              const startsNextDay = row.nextDay && (idx === 0 || !rows[idx - 1].nextDay);
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
                {courts.map((court) => {
                  const cell = row.cells[court.id];
                  return (
                    <td key={court.id} className="border-l p-1 align-top">
                      {cell.status === "available" && (
                        <button
                          type="button"
                          onClick={() => setSelectedSlot({ courtId: court.id, courtName: court.name, startsAtIso: row.startsAtIso })}
                          className="h-11 w-full min-w-28 rounded-sm bg-emerald-50 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300"
                        >
                          + Walk-in
                        </button>
                      )}
                      {cell.status === "booked" && (
                        <button
                          type="button"
                          onClick={() =>
                            cell.bookingId &&
                            setSelectedBooking({
                              id: cell.bookingId,
                              label: cell.label ?? "Booking",
                              startsAtIso: row.startsAtIso,
                              status: cell.bookingStatus ?? "confirmed",
                            })
                          }
                          title={cell.bookingStatus === "pending" ? "Pending confirmation" : "View booking"}
                          className={cn(
                            "h-11 w-full min-w-28 truncate rounded-sm px-1 text-xs font-medium",
                            cell.bookingStatus === "pending"
                              ? "bg-yellow-100 text-yellow-900 hover:bg-yellow-200 dark:bg-yellow-950 dark:text-yellow-300"
                              : "bg-muted text-foreground hover:bg-muted/70"
                          )}
                        >
                          {cell.label}
                          {cell.bookingStatus === "pending" && " (pending)"}
                        </button>
                      )}
                      {cell.status === "closed" && (
                        <div className="h-11 w-full min-w-28 rounded-sm bg-amber-50 text-center text-xs leading-11 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          Closed
                        </div>
                      )}
                      {cell.status === "past" && (
                        <button
                          type="button"
                          onClick={() => setSelectedSlot({ courtId: court.id, courtName: court.name, startsAtIso: row.startsAtIso })}
                          title="Add a missed booking for this past slot"
                          className="h-11 w-full min-w-28 rounded-sm text-xs font-medium text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                        >
                          + Add past
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
              </Fragment>
              );
            })}
          </tbody>
        </table>
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
