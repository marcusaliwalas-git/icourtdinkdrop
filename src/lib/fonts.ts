/** The fonts a venue can be assigned. The super admin picks one per venue (Admin → Platform); the
 * choice is stored on venues.font and applied as `data-font` on <html>, where globals.css re-points
 * the font tokens so the whole tenant site (body + headings) renders in that face. "default" is the
 * two-face Geist + Space Grotesk look. `previewVar` is the CSS variable layout.tsx loads the font
 * into, used to render each option's name in its own face in the super-admin picker. */

export const VENUE_FONTS = [
  { key: "default", label: "Default (Geist)", previewVar: "var(--font-geist-sans)" },
  { key: "poppins", label: "Poppins", previewVar: "var(--font-opt-poppins)" },
  { key: "sora", label: "Sora", previewVar: "var(--font-opt-sora)" },
  { key: "rubik", label: "Rubik", previewVar: "var(--font-opt-rubik)" },
  { key: "fraunces", label: "Fraunces", previewVar: "var(--font-opt-fraunces)" },
  { key: "montserrat", label: "Montserrat", previewVar: "var(--font-opt-montserrat)" },
] as const;

export type VenueFontKey = (typeof VENUE_FONTS)[number]["key"];

export const FONT_KEYS = VENUE_FONTS.map((f) => f.key) as VenueFontKey[];

/** Coerce a stored value to a known font, defaulting to Geist. */
export function normalizeFont(value: unknown): VenueFontKey {
  return typeof value === "string" && (FONT_KEYS as string[]).includes(value) ? (value as VenueFontKey) : "default";
}
