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
// (object-contain, never cropped): small/medium/large cap the height; "original" uses the image's
// natural size (only capped to the content width so it can't overflow). Shared by the editor (the
// choices) and the home page (the class).
export const HERO_SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "original", label: "Original size" },
] as const;

const MEDIA_SIZE_CLASS: Record<string, string> = {
  small: "w-full max-h-64 object-contain",
  medium: "w-full max-h-96 object-contain",
  large: "w-full max-h-[36rem] object-contain",
  original: "max-w-full h-auto",
};

export function mediaSizeClass(size: string | null | undefined): string {
  return MEDIA_SIZE_CLASS[size ?? "medium"] ?? MEDIA_SIZE_CLASS.medium;
}
