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

// Hero / section media size — admin picks how big it displays. The whole image is always shown
// (never cropped): small/medium/large scale the image down by capping its WIDTH (height follows
// the aspect ratio), and the smaller ones are centered. Capping the height instead did nothing for
// a normal landscape photo — it fills the width long before it's ever that tall — so all sizes
// looked identical. "original" uses the image's natural size (only capped to the content width so
// it can't overflow). Shared by the editor (the choices) and the home page (the class).
export const HERO_SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "original", label: "Original size" },
] as const;

const MEDIA_SIZE_CLASS: Record<string, string> = {
  small: "mx-auto w-full max-w-xs h-auto",
  medium: "mx-auto w-full max-w-lg h-auto",
  large: "w-full h-auto",
  original: "max-w-full h-auto",
};

export function mediaSizeClass(size: string | null | undefined): string {
  return MEDIA_SIZE_CLASS[size ?? "medium"] ?? MEDIA_SIZE_CLASS.medium;
}
