import { z } from "zod";
import type { PromoType, DiscountLine } from "../engine";

// "Book N+ courts together → a fixed amount off, per court, per hour."
// Example: minCourts 3, centsOffPerHour 5000 → a 3-court × 2-hour cart gets ₱50/hr off each court
// (3 × 2 × ₱50 = ₱300 total, recorded as ₱100 on each of the three booking rows).

const configSchema = z.object({
  // Threshold of DISTINCT courts in one booking/cart to qualify (two slots on the same court = 1).
  minCourts: z.number().int().min(2),
  // Amount taken off each court-slot, per hour, in cents.
  centsOffPerHour: z.number().int().min(1),
});

export type VolumeDiscountConfig = z.infer<typeof configSchema>;

export const volumeDiscount: PromoType<VolumeDiscountConfig> = {
  key: "volume_discount",
  label: "Multi-court discount",
  scope: "cart", // needs the whole cart to count distinct courts
  configSchema,

  apply(ctx, cfg, promo): DiscountLine[] {
    const distinctCourts = new Set(ctx.segments.map((s) => s.courtId)).size;
    if (distinctCourts < cfg.minCourts) return [];

    return ctx.segments.map((seg, i) => ({
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
  ],
};
