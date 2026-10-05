import { z } from "zod";
import { toZonedTime } from "date-fns-tz";
import type { PromoType, DiscountLine } from "../engine";

// "Book N+ courts together → a fixed amount off, per court, per hour."
// Example: minCourts 3, centsOffPerHour 5000 → a 3-court × 2-hour cart gets ₱50/hr off each court
// (3 × 2 × ₱50 = ₱300 total, recorded as ₱100 on each of the three booking rows).
//
// Optional time window: when both ends are set, only court-slots that fall entirely inside the window
// (venue-local time) qualify — they alone count toward the court threshold and receive the discount.
// Leave the window blank for an any-time deal (the original behaviour).

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
// Blank optional time fields arrive as "" from the admin form — treat as "not set".
const optionalTime = z.preprocess((v) => (v === "" || v == null ? undefined : v), hhmm.optional());

const configSchema = z
  .object({
    // Threshold of DISTINCT courts in one booking/cart to qualify (two slots on the same court = 1).
    minCourts: z.number().int().min(2),
    // Amount taken off each court-slot, per hour, in cents.
    centsOffPerHour: z.number().int().min(1),
    // Optional window ("HH:MM" local); both or neither.
    windowStart: optionalTime,
    windowEnd: optionalTime,
  })
  .refine((c) => !!c.windowStart === !!c.windowEnd, {
    message: "Set both window start and end, or leave both blank.",
  })
  .refine((c) => !c.windowStart || !c.windowEnd || c.windowEnd > c.windowStart, {
    message: "Window end must be after start.",
  });

export type VolumeDiscountConfig = z.infer<typeof configSchema>;

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export const volumeDiscount: PromoType<VolumeDiscountConfig> = {
  key: "volume_discount",
  label: "Multi-court discount",
  scope: "cart", // needs the whole cart to count distinct courts
  configSchema,

  apply(ctx, cfg, promo): DiscountLine[] {
    // With a window set, a slot qualifies only if it falls entirely inside it (venue-local time).
    const inWindow = (seg: (typeof ctx.segments)[number]): boolean => {
      if (!cfg.windowStart || !cfg.windowEnd) return true;
      const local = toZonedTime(new Date(seg.startsAtIso), ctx.timezone);
      const startMin = local.getHours() * 60 + local.getMinutes();
      const endMin = startMin + seg.durationMinutes;
      return startMin >= toMinutes(cfg.windowStart) && endMin <= toMinutes(cfg.windowEnd);
    };

    const eligible = ctx.segments.map((seg, i) => ({ seg, i })).filter(({ seg }) => inWindow(seg));

    // Only the in-window courts count toward the threshold (so the window genuinely gates the deal).
    const distinctCourts = new Set(eligible.map(({ seg }) => seg.courtId)).size;
    if (distinctCourts < cfg.minCourts) return [];

    return eligible.map(({ seg, i }) => ({
      segmentIndex: i,
      cents: Math.round((cfg.centsOffPerHour * seg.durationMinutes) / 60),
      promotionId: promo.id,
      label: promo.name,
    }));
  },

  formFields: [
    {
      name: "minCourts",
      label: "Minimum courts",
      kind: "number",
      required: true,
      help: "Distinct courts in one booking needed to qualify (e.g. 3).",
    },
    {
      name: "centsOffPerHour",
      label: "Discount per hour",
      kind: "money",
      required: true,
      help: "Taken off each court, per hour (e.g. ₱50).",
    },
    {
      name: "windowStart",
      label: "Window start (optional)",
      kind: "time",
      help: "Only slots inside this window qualify. Leave both blank for any time.",
    },
    {
      name: "windowEnd",
      label: "Window end (optional)",
      kind: "time",
      help: "e.g. 18:00–21:00 for an evening-only deal.",
    },
  ],
};
