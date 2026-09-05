/** The theme palettes a venue can be assigned. The super admin picks one per venue (Admin →
 * Platform); the choice is stored on venues.theme and applied as `data-theme` on <html>, where
 * globals.css overrides the design tokens. "default" is the iCourt lime look. The `swatch` is the
 * theme's primary colour, shown in the super-admin picker. */

export const VENUE_THEMES = [
  { key: "default", label: "Midnight Lime", swatch: "#9fce20" },
  { key: "ocean", label: "Ocean", swatch: "#38bdf8" },
  { key: "sunset", label: "Sunset", swatch: "#fb923c" },
  { key: "grape", label: "Grape", swatch: "#a78bfa" },
  { key: "light", label: "Daylight", swatch: "#059669" },
] as const;

export type VenueThemeKey = (typeof VENUE_THEMES)[number]["key"];

export const THEME_KEYS = VENUE_THEMES.map((t) => t.key) as VenueThemeKey[];

/** The one light theme — the app is dark-first (html.dark), so this theme instead drops the dark
 * class and renders every component's light base. */
export const LIGHT_THEME: VenueThemeKey = "light";

/** Coerce a stored value to a known theme, defaulting to the lime look. */
export function normalizeTheme(value: unknown): VenueThemeKey {
  return typeof value === "string" && (THEME_KEYS as string[]).includes(value) ? (value as VenueThemeKey) : "default";
}
