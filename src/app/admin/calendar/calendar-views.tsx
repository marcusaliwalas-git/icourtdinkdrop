"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AdminTimeRow } from "@/lib/availability";
import { CalendarGrid } from "./calendar-grid";
import { CalendarTimeline } from "./calendar-timeline";
import { FindTime } from "./find-time";
import { WalkInBatchSheet } from "./walk-in-batch-sheet";
import { mergeSelection, slotKey, type SelectedSlot } from "./selection";

interface Court {
  id: string;
  name: string;
}

type View = "grid" | "timeline" | "find";
const VIEWS: { key: View; label: string }[] = [
  { key: "grid", label: "Grid" },
  { key: "timeline", label: "Timeline" },
  { key: "find", label: "Find a time" },
];
const STORAGE_KEY = "admin-calendar-view";
const MULTISELECT_KEY = "admin-calendar-multiselect";

/** Switches the admin day view between the classic grid, the resource timeline, and the
 * find-a-time availability search. All three read the same day data, so switching is instant and
 * consistent. The choice is remembered per browser. */
function normalizeView(value: unknown): View {
  return value === "timeline" || value === "find" ? value : "grid";
}

export function CalendarViews({
  timezone,
  courts,
  rows,
  dateLabel,
  defaultView,
}: {
  timezone: string;
  courts: Court[];
  rows: AdminTimeRow[];
  dateLabel: string;
  /** The venue's admin-set default view; a viewer's own saved choice overrides it. */
  defaultView: string;
}) {
  // Start on the venue default for the server + first client render (matches SSR, avoids a hydration
  // mismatch), then adopt this browser's remembered choice once mounted.
  const [view, setView] = useState<View>(normalizeView(defaultView));
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "grid" || saved === "timeline" || saved === "find") setView(saved);
    } catch {
      /* localStorage may be unavailable — fine, stay on the venue default */
    }
  }, []);

  function choose(next: View) {
    setView(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  // Multi-select walk-in mode: tap open cells to gather them, then book all at once. Remembered per
  // browser like the view choice.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Map<string, SelectedSlot>>(new Map());
  const [batchOpen, setBatchOpen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(MULTISELECT_KEY) === "1") setSelectMode(true);
    } catch {
      /* ignore */
    }
  }, []);

  function toggleSelectMode() {
    setSelectMode((on) => {
      const next = !on;
      if (!next) setSelected(new Map()); // leaving select mode clears the pending selection
      try {
        localStorage.setItem(MULTISELECT_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function onToggleSelect(slot: SelectedSlot) {
    setSelected((prev) => {
      const next = new Map(prev);
      const key = slotKey(slot.courtId, slot.startsAtIso);
      if (next.has(key)) next.delete(key);
      else next.set(key, slot);
      return next;
    });
  }

  const selectedKeys = useMemo(() => new Set(selected.keys()), [selected]);
  const segments = useMemo(() => mergeSelection([...selected.values()]), [selected]);
  // The grid/timeline own selection; find-a-time has no cells to select.
  const canMultiSelect = view !== "find";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex w-fit gap-1 rounded-full border border-input bg-background p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => choose(v.key)}
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

        {canMultiSelect && (
          <button
            type="button"
            onClick={toggleSelectMode}
            aria-pressed={selectMode}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              selectMode
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-input text-muted-foreground hover:text-foreground"
            )}
          >
            {selectMode ? "✓ Multi-select" : "Multi-select"}
          </button>
        )}
      </div>

      {selectMode && canMultiSelect && (
        <p className="text-xs text-muted-foreground">
          Tap open slots across courts and times, then book them together — great for open-play sessions.
        </p>
      )}

      {view !== "find" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-border bg-muted" /> Confirmed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-yellow-200 dark:bg-yellow-800" /> Pending
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm border border-border"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(217,165,74,0.5) 0 3px, transparent 3px 6px)" }}
            />{" "}
            Closed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-emerald-500/40 bg-emerald-500/20" /> Open — tap to book
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-dashed border-border" /> Past
          </span>
          {view === "timeline" && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-0.5 bg-primary" /> Now
            </span>
          )}
        </div>
      )}

      {view === "grid" && (
        <CalendarGrid
          timezone={timezone}
          courts={courts}
          rows={rows}
          selectMode={selectMode}
          selectedKeys={selectedKeys}
          onToggleSelect={onToggleSelect}
        />
      )}
      {view === "timeline" && (
        <CalendarTimeline
          timezone={timezone}
          courts={courts}
          rows={rows}
          selectMode={selectMode}
          selectedKeys={selectedKeys}
          onToggleSelect={onToggleSelect}
        />
      )}
      {view === "find" && <FindTime timezone={timezone} courts={courts} rows={rows} dateLabel={dateLabel} />}

      {/* Sticky action bar while multi-selecting — count + book/clear. */}
      {selectMode && canMultiSelect && selected.size > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-popover px-4 py-2 shadow-lg">
          <span className="text-sm font-medium">
            {selected.size} slot{selected.size === 1 ? "" : "s"} · {segments.length} booking{segments.length === 1 ? "" : "s"}
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Map())}>
            Clear
          </Button>
          <Button type="button" size="sm" onClick={() => setBatchOpen(true)}>
            Book walk-ins
          </Button>
        </div>
      )}

      <WalkInBatchSheet
        open={batchOpen}
        onOpenChange={setBatchOpen}
        segments={segments}
        timezone={timezone}
        onBooked={() => {
          setBatchOpen(false);
          setSelected(new Map());
        }}
      />
    </div>
  );
}
