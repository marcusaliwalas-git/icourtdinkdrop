/** Shared shapes + platform list for the per-venue site footer (rendered by SiteFooter, edited in
 * Admin → Footer). Socials and custom links are stored as jsonb arrays on venues. */

export const SOCIAL_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "x", label: "X" },
  { value: "youtube", label: "YouTube" },
  { value: "website", label: "Website" },
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]["value"];

export type FooterSocial = { platform: string; url: string };
export type FooterLink = { label: string; url: string };

const KNOWN = new Set(SOCIAL_PLATFORMS.map((p) => p.value));

export function socialLabel(platform: string): string {
  return SOCIAL_PLATFORMS.find((p) => p.value === platform)?.label ?? platform;
}

/** Coerce the jsonb column into a clean, typed list — drop anything malformed or without a url. */
export function parseSocials(value: unknown): FooterSocial[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is FooterSocial => !!s && typeof s === "object" && typeof (s as FooterSocial).url === "string")
    .map((s) => ({ platform: KNOWN.has(s.platform as SocialPlatform) ? s.platform : "website", url: s.url }))
    .filter((s) => s.url.trim().length > 0);
}

export function parseLinks(value: unknown): FooterLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (l): l is FooterLink =>
        !!l && typeof l === "object" && typeof (l as FooterLink).label === "string" && typeof (l as FooterLink).url === "string"
    )
    .map((l) => ({ label: l.label, url: l.url }))
    .filter((l) => l.label.trim().length > 0 && l.url.trim().length > 0);
}
