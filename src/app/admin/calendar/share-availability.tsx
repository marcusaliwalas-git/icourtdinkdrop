"use client";

import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Status = "available" | "booked" | "closed" | "past";
interface Court {
  id: string;
  name: string;
}
interface Row {
  startsAtIso: string;
  cells: Record<string, Status>;
}
interface RateLine {
  label: string;
  price: string;
}

const STATUS_TEXT: Record<Exclude<Status, "past">, string> = {
  available: "AVAILABLE",
  booked: "BOOKED",
  closed: "CLOSED",
};

// Past the text layout's comfortable column count, switch to a compact color-tile board: the status
// words no longer fit, so each cell becomes a solid tile and a legend explains the colours.
const COMPACT_THRESHOLD = 6;

// The poster takes its colours from the venue's active theme (the same CSS variables the app uses),
// so it matches the venue's branding — a dark theme gives a dark poster, a light one a light poster.
const C = {
  bg: "var(--background)",
  text: "var(--foreground)",
  accent: "var(--primary)",
  muted: "var(--muted-foreground)",
  panel: "color-mix(in srgb, var(--foreground) 7%, transparent)",
  bookedFill: "color-mix(in srgb, var(--muted-foreground) 50%, transparent)",
  hairline: "color-mix(in srgb, var(--primary) 45%, transparent)",
  hairlineSoft: "color-mix(in srgb, var(--primary) 30%, transparent)",
};

// Tile background for the compact board. Available is the brand accent; booked a solid muted fill;
// closed/past a faint outlined tile (drawn with a border at the call site).
function tileBg(s: Status): string {
  return s === "available" ? C.accent : s === "booked" ? C.bookedFill : C.panel;
}

/** A shareable "Court Available" poster built from the day's calendar grid, styled in the venue's
 * theme. Consecutive hours whose every-court status is identical collapse into one range row (so a
 * mostly-open day reads as a few clean bands). Rendered to a PNG the admin can post.
 *
 * Up to COMPACT_THRESHOLD courts it uses word cells (AVAILABLE / BOOKED / CLOSED). Beyond that the
 * words stop fitting, so it renders a compact color-tile board with a legend and widens itself to
 * keep every court column legible. */
export function ShareAvailability({
  venueName,
  dateNumeric,
  weekday,
  courts,
  rows,
  rateLines,
  siteUrl,
  timezone,
}: {
  venueName: string;
  dateNumeric: string;
  weekday: string;
  courts: Court[];
  rows: Row[];
  rateLines: RateLine[];
  siteUrl: string;
  timezone: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"orig" | "ratio" | null>(null);
  const posterRef = useRef<HTMLDivElement>(null);

  const fmtTime = useMemo(
    () => (iso: string) =>
      // Whole-hour slots, so drop a ":00" to keep ranges short ("1 PM – 10 PM").
      new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone })
        .format(new Date(iso))
        .replace(":00", ""),
    [timezone]
  );

  // Drop fully-elapsed hours, then merge consecutive rows that look identical across every court.
  const groups = useMemo(() => {
    const key = (cells: Record<string, Status>) => courts.map((c) => cells[c.id] ?? "closed").join("|");
    const kept = rows.filter((r) => !courts.every((c) => (r.cells[c.id] ?? "closed") === "past"));
    const out: { startIso: string; endIso: string; cells: Record<string, Status> }[] = [];
    for (const r of kept) {
      const endIso = new Date(new Date(r.startsAtIso).getTime() + 3_600_000).toISOString();
      const last = out[out.length - 1];
      if (last && key(last.cells) === key(r.cells)) last.endIso = endIso;
      else out.push({ startIso: r.startsAtIso, endIso, cells: r.cells });
    }
    return out;
  }, [rows, courts]);

  function save(dataUrl: string, suffix: string) {
    const slug = dateNumeric.replace(/\s|\//g, "-");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `court-availability-${slug}${suffix}.png`;
    a.click();
  }

  // Download the poster at its natural height.
  async function downloadOriginal() {
    const node = posterRef.current;
    if (!node) return;
    setBusy("orig");
    try {
      // Fill transparent areas with the theme's resolved background so the PNG isn't see-through.
      const bg = getComputedStyle(node).backgroundColor;
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: bg });
      save(dataUrl, "");
    } finally {
      setBusy(null);
    }
  }

  // Download at an exact 4:5 portrait (social-friendly). Pad the poster to 4:5 with the theme
  // background using html-to-image's own output size + a centring margin — same proven render path
  // as the original export (cloning into a detached frame rendered as a blank/black image).
  async function downloadRatio() {
    const node = posterRef.current;
    if (!node) return;
    setBusy("ratio");
    try {
      const bg = getComputedStyle(node).backgroundColor;
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      const RATIO = 4 / 5;
      let fw = w;
      let fh = h;
      if (w / h > RATIO) fh = Math.round(w / RATIO); // shorter than 4:5 → pad top/bottom
      else fw = Math.round(h * RATIO); // taller than 4:5 → pad left/right
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: bg,
        width: fw,
        height: fh,
        style: { margin: `${Math.max(0, (fh - h) / 2)}px ${Math.max(0, (fw - w) / 2)}px` },
      });
      save(dataUrl, "-4x5");
    } finally {
      setBusy(null);
    }
  }

  const compact = courts.length > COMPACT_THRESHOLD;

  // Layout. Small venues keep the proven fixed-width word layout; larger ones switch to fixed-pixel
  // columns and a poster width that grows with the court count, so tiles never get squeezed.
  const GAP = 6;
  const PAD_X = 30;
  const timeColW = 96;
  // Wide enough that a typical single-word court label ("OUTDOOR", "CENTER") fits on one line; longer
  // words still wrap within the column. Narrower than this and words like "OUTDOOR" spilled over.
  const courtColW = 72;
  const posterW = compact ? PAD_X * 2 + timeColW + courts.length * (courtColW + GAP) : BASE_W;
  const gridCols = compact
    ? `${timeColW}px ${courts.map(() => `${courtColW}px`).join(" ")}`
    : `1.35fr ${courts.map(() => "1fr").join(" ")}`;

  // Scale the on-screen preview down to fit the dialog (export always uses the full-size poster).
  const previewScale = Math.min(0.82, PREVIEW_MAX_W / posterW);

  const cellColor = (s: Status) => (s === "available" ? C.accent : C.muted);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-md">
          Share availability
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share today&apos;s availability</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          A poster of this day&apos;s open courts, in your venue&apos;s colours, ready to post. Open hours with the same
          status across courts are grouped into bands.
        </p>

        {/* Preview — scaled to fit the dialog; the poster itself renders at full size for the export.
            `zoom` (not transform) shrinks the layout box too, so the frame hugs the poster with no
            leftover whitespace at any width. */}
        <div className="flex justify-center overflow-x-auto rounded-lg border border-border p-3">
          <div style={{ zoom: previewScale }}>
            <div
              ref={posterRef}
              style={{
                width: posterW,
                background: C.bg,
                color: C.text,
                fontFamily: "Arial, Helvetica, sans-serif",
                padding: "34px 30px 26px",
                boxSizing: "border-box",
              }}
            >
              {/* Masthead */}
              <div style={{ textAlign: "center", marginBottom: 22 }}>
                <div
                  style={{
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontSize: 30,
                    letterSpacing: 8,
                    color: C.accent,
                    textTransform: "uppercase",
                    lineHeight: 1.1,
                  }}
                >
                  {venueName}
                </div>
                <div style={{ height: 1, background: C.hairline, margin: "16px auto 0", width: 160 }} />
              </div>

              <div style={{ textAlign: "center", marginBottom: 18 }}>
                <div style={{ fontSize: 22, letterSpacing: 5, fontWeight: 700 }}>COURT AVAILABLE</div>
                <div style={{ fontSize: 14, letterSpacing: 3, color: C.muted, marginTop: 6 }}>
                  {weekday.toUpperCase()} · {dateNumeric}
                </div>
              </div>

              {/* Legend — only needed on the compact tile board, where cells carry no words. */}
              {compact && (
                <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 16 }}>
                  <LegendItem swatch={C.accent} label="AVAILABLE" />
                  <LegendItem swatch={C.bookedFill} label="BOOKED" />
                  <LegendItem swatch={C.panel} outline label="CLOSED" />
                </div>
              )}

              {/* Grid header */}
              <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: GAP, marginBottom: GAP }}>
                <Cell head compact={compact}>
                  TIME
                </Cell>
                {courts.map((c) => (
                  <Cell head compact={compact} key={c.id}>
                    {c.name.toUpperCase()}
                  </Cell>
                ))}
              </div>

              {/* Grid body */}
              {groups.length === 0 ? (
                <div
                  style={{
                    background: C.panel,
                    borderRadius: 6,
                    textAlign: "center",
                    color: C.muted,
                    padding: "18px 0",
                  }}
                >
                  No open hours to show for this day.
                </div>
              ) : (
                groups.map((g, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: gridCols, gap: GAP, marginBottom: GAP }}>
                    <Cell time compact={compact}>
                      {fmtTime(g.startIso)} – {fmtTime(g.endIso)}
                    </Cell>
                    {courts.map((c) => {
                      const s = (g.cells[c.id] ?? "closed") as Status;
                      if (compact) {
                        const closed = s === "closed" || s === "past";
                        return (
                          <div
                            key={c.id}
                            title={STATUS_TEXT[s === "past" ? "closed" : s]}
                            style={{
                              background: tileBg(s),
                              border: closed ? `1px solid ${C.hairlineSoft}` : "none",
                              borderRadius: 4,
                              minHeight: 28,
                            }}
                          />
                        );
                      }
                      return (
                        <Cell key={c.id} color={cellColor(s)}>
                          {STATUS_TEXT[s === "past" ? "closed" : s]}
                        </Cell>
                      );
                    })}
                  </div>
                ))
              )}

              {/* Rates */}
              {rateLines.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    flexWrap: "wrap",
                    marginTop: 26,
                    borderTop: `1px solid ${C.hairlineSoft}`,
                    paddingTop: 20,
                  }}
                >
                  {rateLines.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        textAlign: "center",
                        padding: "0 22px",
                        borderLeft: i === 0 ? "none" : `1px solid ${C.hairlineSoft}`,
                      }}
                    >
                      <div style={{ fontSize: 12, letterSpacing: 2, color: C.muted }}>{r.label.toUpperCase()}</div>
                      <div style={{ fontSize: 30, fontWeight: 700, color: C.accent, marginTop: 4 }}>{r.price}</div>
                      <div style={{ fontSize: 10, letterSpacing: 2, color: C.muted }}>PER HOUR</div>
                    </div>
                  ))}
                </div>
              )}

              {siteUrl && (
                <div style={{ textAlign: "center", marginTop: 24, fontSize: 12, letterSpacing: 3, color: C.accent }}>
                  {siteUrl.toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={downloadOriginal} disabled={busy !== null}>
            {busy === "orig" ? "Preparing…" : "Download (original)"}
          </Button>
          <Button onClick={downloadRatio} disabled={busy !== null}>
            {busy === "ratio" ? "Preparing…" : "Download 4:5"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const BASE_W = 540;
// Widest the preview renders before `zoom` scales it down to fit the dialog.
const PREVIEW_MAX_W = 520;

function LegendItem({ swatch, label, outline }: { swatch: string; label: string; outline?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span
        style={{
          width: 13,
          height: 13,
          borderRadius: 3,
          background: swatch,
          border: outline ? `1px solid ${C.hairlineSoft}` : "none",
          display: "inline-block",
        }}
      />
      <span style={{ fontSize: 10.5, letterSpacing: 1.5, fontWeight: 700, color: C.muted }}>{label}</span>
    </div>
  );
}

function Cell({
  children,
  head,
  time,
  color,
  compact,
}: {
  children: React.ReactNode;
  head?: boolean;
  time?: boolean;
  color?: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        background: C.panel,
        borderRadius: 6,
        minWidth: 0, // let narrow columns shrink so the grid never overflows the poster width
        // Wrapping, by cell kind:
        //  • Compact fixed-width columns use "anywhere" — a word longer than the column (e.g. a very
        //    long court name) is force-broken instead of spilling into the next column; names that fit
        //    still break only at spaces ("COURT" / "4 (INDOOR)").
        //  • The non-compact header uses "break-word" so fr tracks don't collapse to one character and
        //    split a name mid-word ("COUR" / "T 1"); its status words keep "anywhere" to fit a label.
        overflowWrap: head === compact ? "anywhere" : "break-word",
        wordBreak: "normal",
        display: "flex",
        alignItems: "center",
        justifyContent: head || time ? "flex-start" : "center",
        padding: compact ? (head ? "9px 4px" : "8px 5px") : head ? "12px 10px" : "15px 10px",
        fontSize: compact ? (head ? 9.5 : 10) : head ? 11 : 11.5,
        fontWeight: head ? 700 : 600,
        letterSpacing: compact ? (head ? 0.2 : 0.3) : head ? 1.5 : time ? 0.5 : 0.8,
        color: head ? C.muted : time ? C.text : color ?? C.text,
        textAlign: head || time ? "left" : "center",
        lineHeight: 1.25,
      }}
    >
      {children}
    </div>
  );
}
