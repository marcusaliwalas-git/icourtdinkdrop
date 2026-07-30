/** Whole-hour booking durations, 1-24 hours, shared by the public and admin booking forms. */
export const DURATION_HOURS = Array.from({ length: 24 }, (_, i) => i + 1);

export function durationLabel(hours: number): string {
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
