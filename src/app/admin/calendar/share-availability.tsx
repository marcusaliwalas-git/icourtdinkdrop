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

// The poster takes its colours from the venue's active theme (the same CSS variables the app uses),
// so it matches the venue's branding — a dark theme gives a dark poster, a light one a light poster.
const C = {
  bg: "var(--background)",
  text: "var(--foreground)",
  accent: "var(--primary)",
  muted: "var(--muted-foreground)",
  panel: "color-mix(in srgb, var(--foreground) 7%, transparent)",
  hairline: "color-mix(in srgb, var(--primary) 45%, transparent)",
  hairlineSoft: "color-mix(in srgb, var(--primary) 30%, transparent)",
};

/** A shareable "Court Available" poster built from the day's calendar grid, styled in the venue's
 * theme. Consecutive hours whose every-court status is identical collapse into one range row (so a
 * mostly-open day reads as a few clean bands). Rendered to a PNG the admin can post. */
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

  const cellColor = (s: Status) => (s === "available" ? C.accent : s === "booked" ? C.muted : C.muted);

  // Column template: a wide time column, then one equal column per court.
  const gridCols = `1.35fr ${courts.map(() => "1fr").join(" ")}`;

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

        {/* Preview — scaled to fit the dialog; the poster itself renders at full size for the export. */}
        <div className="flex justify-center overflow-hidden rounded-lg border border-border p-3">
          <div style={{ width: POSTER_W, transform: "scale(0.82)", transformOrigin: "top center" }}>
            <div
              ref={posterRef}
              style={{
                width: POSTER_W,
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

              {/* Grid header */}
              <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 6, marginBottom: 6 }}>
                <Cell head>TIME</Cell>
                {courts.map((c) => (
                  <Cell head key={c.id}>
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
                  <div key={i} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 6, marginBottom: 6 }}>
                    <Cell time>
                      {fmtTime(g.startIso)} – {fmtTime(g.endIso)}
                    </Cell>
                    {courts.map((c) => {
                      const s = (g.cells[c.id] ?? "closed") as Status;
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

const POSTER_W = 540;

function Cell({
  children,
  head,
  time,
  color,
}: {
  children: React.ReactNode;
  head?: boolean;
  time?: boolean;
  color?: string;
}) {
  return (
    <div
      style={{
        background: C.panel,
        borderRadius: 6,
        minWidth: 0, // let 1fr columns shrink so the grid never overflows the poster width
        overflowWrap: "anywhere",
        display: "flex",
        alignItems: "center",
        justifyContent: head || time ? "flex-start" : "center",
        padding: head ? "12px 10px" : "15px 10px",
        fontSize: head ? 11 : 11.5,
        fontWeight: head ? 700 : 600,
        letterSpacing: head ? 1.5 : time ? 0.5 : 0.8,
        color: head ? C.muted : time ? C.text : color ?? C.text,
        textAlign: head || time ? "left" : "center",
        lineHeight: 1.25,
      }}
    >
      {children}
    </div>
  );
}
