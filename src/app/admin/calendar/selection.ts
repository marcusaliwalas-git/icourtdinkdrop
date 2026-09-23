// Turns a set of selected open hour-cells (admin multi-select walk-in) into bookable segments:
// contiguous hours on the same court collapse into one segment, so "7-11pm on Court 3" becomes a
// single 4-hour booking rather than four. Pure + client-safe.

export interface SelectedSlot {
  courtId: string;
  courtName: string;
  startsAtIso: string;
}

export interface WalkInSegment {
  courtId: string;
  courtName: string;
  startsAt: string; // ISO
  endsAt: string; // ISO (exclusive)
  durationMinutes: number;
  /** Estimated walk-in price for the segment, filled in by the caller (non-member rate). */
  estimateCents?: number;
}

/** Stable key for a selected hour-cell. */
export function slotKey(courtId: string, startsAtIso: string): string {
  return `${courtId}|${startsAtIso}`;
}

const HOUR_MS = 60 * 60 * 1000;

/** Merge contiguous hour-cells per court into segments, sorted by court name then start time. */
export function mergeSelection(slots: SelectedSlot[]): WalkInSegment[] {
  const byCourt = new Map<string, SelectedSlot[]>();
  for (const s of slots) {
    const arr = byCourt.get(s.courtId) ?? [];
    arr.push(s);
    byCourt.set(s.courtId, arr);
  }

  const segments: WalkInSegment[] = [];
  for (const [courtId, arr] of byCourt) {
    arr.sort((a, b) => new Date(a.startsAtIso).getTime() - new Date(b.startsAtIso).getTime());
    const courtName = arr[0].courtName;
    let segStart = new Date(arr[0].startsAtIso).getTime();
    let prev = segStart;
    for (let i = 1; i <= arr.length; i++) {
      const cur = i < arr.length ? new Date(arr[i].startsAtIso).getTime() : null;
      if (cur !== null && cur === prev + HOUR_MS) {
        prev = cur; // still contiguous — extend
        continue;
      }
      const endMs = prev + HOUR_MS;
      segments.push({
        courtId,
        courtName,
        startsAt: new Date(segStart).toISOString(),
        endsAt: new Date(endMs).toISOString(),
        durationMinutes: Math.round((endMs - segStart) / 60000),
      });
      if (cur !== null) {
        segStart = cur;
        prev = cur;
      }
    }
  }

  segments.sort(
    (a, b) =>
      a.courtName.localeCompare(b.courtName) || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
  return segments;
}
