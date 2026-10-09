/** The theme palettes a venue can be assigned. The super admin picks one per venue (Admin →
 * Platform); the choice is stored on venues.theme and applied as `data-theme` on <html>, where
 * globals.css overrides the design tokens. "default" is the iCourt lime look. The `swatch` is the
 * theme's primary colour, shown in the super-admin picker. */

export const VENUE_THEMES = [
  { key: "default", label: "Midnight Lime", swatch: "#9fce20" },
  { key: "ocean", label: "Ocean", swatch: "#38bdf8" },
  { key: "sunset", label: "Sunset", swatch: "#fb923c" },
  { key: "grape", label: "Grape", swatch: "#c026d3" },
  { key: "light", label: "Daylight", swatch: "#059669" },
  { key: "gold", label: "Midnight Gold", swatch: "#EBB82D" },
  { key: "onyx", label: "Onyx Gold", swatch: "#C9A24B" },
  { key: "hardcourt", label: "Hardcourt", swatch: "#2f90d0" },
  { key: "teal", label: "Clean Teal", swatch: "#0d9488" },
  { key: "bgg", label: "Blue Green Gray", swatch: "#3b82f6" },
] as const;

export type VenueThemeKey = (typeof VENUE_THEMES)[number]["key"];

export const THEME_KEYS = VENUE_THEMES.map((t) => t.key) as VenueThemeKey[];

/** The light themes — the app is dark-first (html.dark), so these drop the dark class and render
 * every component's light base, skinning the :root[data-theme] tokens instead. */
export const LIGHT_THEMES: VenueThemeKey[] = ["light", "teal"];
/** The default/primary light theme. */
export const LIGHT_THEME: VenueThemeKey = "light";

/** Whether a theme renders on the light base (no `dark` class). */
export function isLightTheme(theme: VenueThemeKey): boolean {
  return LIGHT_THEMES.includes(theme);
}

/** Coerce a stored value to a known theme, defaulting to the lime look. */
export function normalizeTheme(value: unknown): VenueThemeKey {
  return typeof value === "string" && (THEME_KEYS as string[]).includes(value) ? (value as VenueThemeKey) : "default";
}
