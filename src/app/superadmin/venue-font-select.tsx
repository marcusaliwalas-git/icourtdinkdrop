"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VENUE_FONTS, normalizeFont } from "@/lib/fonts";
import { setVenueFont } from "./actions";

/** Super-admin control: pick the font for a venue's whole site. Each option's name is shown in its
 * own face (the families are loaded app-wide in layout.tsx), so the picker previews the choice. */
export function VenueFontSelect({ venueId, font }: { venueId: string; font: unknown }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(normalizeFont(font));
  const [error, setError] = useState<string | null>(null);

  const previewVar = VENUE_FONTS.find((f) => f.key === value)?.previewVar;

  function onChange(next: string) {
    const prev = value;
    setValue(normalizeFont(next));
    setError(null);
    startTransition(async () => {
      const result = await setVenueFont(venueId, next);
      if (result.error) {
        setValue(prev); // revert on failure
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        aria-label="Font"
        value={value}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: previewVar }}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
      >
        {VENUE_FONTS.map((f) => (
          <option key={f.key} value={f.key} style={{ fontFamily: f.previewVar }}>
            {f.label}
          </option>
        ))}
      </select>
      {error && <span className="max-w-[16rem] text-right text-xs text-destructive">{error}</span>}
    </div>
  );
}
