// Built-in home-page copy used when a venue hasn't customized it. Shared by the public home page
// (as the fallback) and the admin editor (as placeholders) so the two never drift.
export const DEFAULT_HOW_STEPS = [
  "Pick a time",
  "Send your request",
  "Pay via transfer",
  "Wait for confirmation",
];

export const DEFAULT_HOW_NOTE =
  "The venue confirms every booking before it's final — you'll get a reference code either way.";

// Hero image/video size — admin picks how tall it displays. Kept as aspect ratios so it stays
// responsive; larger = taller. Shared by the editor (the choices) and the home page (the class).
export const HERO_SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

export const HERO_SIZE_ASPECT: Record<string, string> = {
  small: "aspect-[21/9]",
  medium: "aspect-video",
  large: "aspect-[3/2]",
};

export function heroAspect(size: string | null | undefined): string {
  return HERO_SIZE_ASPECT[size ?? "medium"] ?? HERO_SIZE_ASPECT.medium;
}
