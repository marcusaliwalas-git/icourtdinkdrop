"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AdminTimeRow } from "@/lib/availability";
import { WalkInSheet } from "./walk-in-sheet";

interface Court {
  id: string;
  name: string;
}

const DURATIONS = Array.from({ length: 12 }, (_, i) => i + 1);

type CourtResult =
  | { court: Court; available: true }
  | { court: Court; available: false; reason: "Booked" | "Closed" | "Past" | "Outside hours" };

export function FindTime({
  timezone,
  courts,
  rows,
  dateLabel,
}: {
  timezone: string;
  courts: Court[];
  rows: AdminTimeRow[];
  dateLabel: string;
}) {
  // Default the start to the first slot that hasn't passed (else the first slot of the day).
  const defaultStart = useMemo(() => {
    const now = Date.now();
    const idx = rows.findIndex((r) => new Date(r.startsAtIso).getTime() >= now);
    return idx >= 0 ? idx : 0;
  }, [rows]);

  const [startIdx, setStartIdx] = useState(defaultStart);
  const [duration, setDuration] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState<{ courtId: string; courtName: string; startsAtIso: string } | null>(null);

  const results: CourtResult[] = useMemo(() => {
    return courts.map((court) => {
      if (startIdx + duration > rows.length) return { court, available: false, reason: "Outside hours" as const };
      const window = rows.slice(startIdx, startIdx + duration).map((r) => r.cells[court.id]?.status);
      if (window.every((s) => s === "available")) return { court, available: true as const };
      const reason = window.includes("booked")
        ? ("Booked" as const)
        : window.includes("closed")
          ? ("Closed" as const)
          : ("Past" as const);
      return { court, available: false, reason };
    });
  }, [courts, rows, startIdx, duration]);

  const openCourts = results.filter((r): r is Extract<CourtResult, { available: true }> => r.available);
  const busyCourts = results.filter((r): r is Extract<CourtResult, { available: false }> => !r.available);
  const startRow = rows[startIdx];
  const endLabel = rows[startIdx + duration - 1]?.endLabel ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ftStart">Start time</Label>
          <select
            id="ftStart"
            value={startIdx}
            onChange={(e) => setStartIdx(Number(e.target.value))}
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
          <Label htmlFor="ftDur">Duration</Label>
          <select
            id="ftDur"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {DURATIONS.map((h) => (
              <option key={h} value={h}>
                {h} {h === 1 ? "hour" : "hours"}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm text-muted-foreground">
          {dateLabel}
          {startRow ? ` · ${startRow.label}${endLabel ? `–${endLabel}` : ""}` : ""}
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">
          {openCourts.length} of {courts.length} {openCourts.length === 1 ? "court" : "courts"} available
        </h2>
        {openCourts.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No courts are free for that window. Try a different time or a shorter duration.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60 rounded-md border">
            {openCourts.map(({ court }) => (
              <li key={court.id} className="flex items-center justify-between gap-3 p-3">
                <span className="font-medium">{court.name}</span>
                <Button
                  size="sm"
                  onClick={() => setSelectedSlot({ courtId: court.id, courtName: court.name, startsAtIso: startRow.startsAtIso })}
                >
                  Book
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {busyCourts.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Not available</h2>
          <ul className="flex flex-wrap gap-2">
            {busyCourts.map(({ court, reason }) => (
              <li key={court.id} className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
                {court.name} · {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <WalkInSheet
        open={selectedSlot !== null}
        onOpenChange={(open) => !open && setSelectedSlot(null)}
        courtId={selectedSlot?.courtId ?? ""}
        courtName={selectedSlot?.courtName ?? ""}
        startsAtIso={selectedSlot?.startsAtIso ?? ""}
        timezone={timezone}
      />
    </div>
  );
}
