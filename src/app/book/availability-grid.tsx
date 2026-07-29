"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { BookingSheet } from "./booking-sheet";
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

export function AvailabilityGrid({
  timezone,
  courts,
  rows,
  courtIds,
  isLoggedIn,
}: {
  timezone: string;
  courts: Court[];
  rows: TimeRow[];
  courtIds: string[];
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ court: Court; startsAtIso: string } | null>(null);

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
                <th key={court.id} className="min-w-28 border-l p-2 text-left font-medium">
                  {court.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.startsAtIso} className="border-t">
                <td className="sticky left-0 z-10 bg-background p-2 text-xs whitespace-nowrap text-muted-foreground">
                  {row.label}
                </td>
                {courts.map((court) => {
                  const status = row.cells[court.id];
                  const isAvailable = status === "available";
                  return (
                    <td key={court.id} className="border-l p-1 align-top">
                      <button
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => isAvailable && setSelected({ court, startsAtIso: row.startsAtIso })}
                        aria-label={`${court.name} at ${row.label}, ${STATUS_LABEL[status] || "unavailable"}`}
                        className={cn(
                          "h-11 w-full min-w-24 rounded-sm text-xs font-medium transition-colors",
                          isAvailable && "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300",
                          status === "booked" && "bg-muted text-muted-foreground",
                          status === "closed" && "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                          status === "past" && "bg-transparent text-transparent"
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

      <BookingSheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        court={selected?.court ?? null}
        startsAtIso={selected?.startsAtIso ?? ""}
        timezone={timezone}
        isLoggedIn={isLoggedIn}
      />
    </>
  );
}
