import { z } from "zod";
import { audienceOf, type PromoType, type DiscountLine } from "../engine";

// "Book at least N hours on a court → a percentage off that court-slot, for the chosen audiences."
// Example: minHours 2, percentOff 15, audiences [guest, signed_in] → a 2-hour (or longer) booking by a
// non-member gets 15% off. Per court-slot, so each qualifying court in a cart gets its own discount.

const AUDIENCES = ["guest", "signed_in", "member"] as const;

const configSchema = z.object({
  minHours: z.number().int().min(1),
  percentOff: z.number().int().min(1).max(100),
  // Who the deal applies to. Empty is treated as "everyone" for safety, but the form requires a pick.
  audiences: z.array(z.enum(AUDIENCES)).default([]),
});

export type PercentDiscountConfig = z.infer<typeof configSchema>;

export const percentDiscount: PromoType<PercentDiscountConfig> = {
  key: "percent_discount",
  label: "Percentage off (min hours)",
  scope: "booking", // evaluated per court-slot
  configSchema,

  apply(ctx, cfg, promo): DiscountLine[] {
    // Audience gate: an empty list means everyone; otherwise the booker's bucket must be included.
    if (cfg.audiences.length > 0 && !cfg.audiences.includes(audienceOf(ctx))) return [];

    const lines: DiscountLine[] = [];
    ctx.segments.forEach((seg, i) => {
      if (seg.durationMinutes / 60 < cfg.minHours) return; // must meet the minimum duration
      const cents = Math.round((seg.baseTotalCents * cfg.percentOff) / 100);
      if (cents > 0) lines.push({ segmentIndex: i, cents, promotionId: promo.id, label: promo.name });
    });
    return lines;
  },

  formFields: [
    {
      name: "minHours",
      label: "Minimum hours",
      kind: "number",
      required: true,
      help: "Hours on one court needed to qualify (e.g. 2).",
    },
    {
      name: "percentOff",
      label: "Discount %",
      kind: "number",
      required: true,
      help: "Percent off each qualifying court-slot (1–100).",
    },
    {
      name: "audiences",
      label: "Applies to",
      kind: "checkboxes",
      required: true,
      help: "Who gets the deal. Tick one or more.",
      options: [
        { value: "guest", label: "Guests (no account)" },
        { value: "signed_in", label: "Signed-in (non-member)" },
        { value: "member", label: "Members" },
      ],
    },
  ],
};
