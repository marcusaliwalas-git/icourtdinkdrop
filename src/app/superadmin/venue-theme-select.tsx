"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VENUE_THEMES, normalizeTheme } from "@/lib/themes";
import { setVenueTheme } from "./actions";

/** Super-admin control: pick one of the four palettes for a venue. The swatch dot shows the
 * currently-selected theme's primary colour. */
export function VenueThemeSelect({ venueId, theme }: { venueId: string; theme: unknown }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(normalizeTheme(theme));
  const [error, setError] = useState<string | null>(null);

  const swatch = VENUE_THEMES.find((t) => t.key === value)?.swatch ?? "#9fce20";

  function onChange(next: string) {
    const prev = value;
    setValue(normalizeTheme(next));
    setError(null);
    startTransition(async () => {
      const result = await setVenueTheme(venueId, next);
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
      <div className="flex items-center gap-2">
        <span className="size-3 shrink-0 rounded-full border border-border" style={{ backgroundColor: swatch }} aria-hidden />
        <select
          aria-label="Theme"
          value={value}
          disabled={isPending}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {VENUE_THEMES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {error && <span className="max-w-[16rem] text-right text-xs text-destructive">{error}</span>}
    </div>
  );
}
