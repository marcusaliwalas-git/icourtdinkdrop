import { z } from "zod";
import { audienceOf, type PromoType, type DiscountLine } from "../engine";

// "Book at least N hours in total → a percentage off the whole booking, for the chosen audiences."
// The minimum is the combined hours across every court in the cart, not per court: e.g. Court 1, 2 and
// 3 booked for 1 hour each counts as 3 hours. Once the cart meets the minimum, every court-slot in it
// gets the percentage off.
// Example: minHours 3, percentOff 15, audiences [guest, signed_in] → a non-member booking totalling 3+
// hours (one long booking, or several shorter ones across courts) gets 15% off every slot.

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
  scope: "cart", // the minimum is the combined hours across the whole cart, so it needs every segment
  ownsAudience: true, // audience is chosen via the "Applies to" field, not the shared Eligibility control
  configSchema,

  apply(ctx, cfg, promo): DiscountLine[] {
    // Audience gate: an empty list means everyone; otherwise the booker's bucket must be included.
    if (cfg.audiences.length > 0 && !cfg.audiences.includes(audienceOf(ctx))) return [];

    // Qualify on the total hours across every court in the cart (e.g. 3 courts × 1 hour = 3 hours).
    const totalMinutes = ctx.segments.reduce((sum, s) => sum + s.durationMinutes, 0);
    if (totalMinutes / 60 < cfg.minHours) return [];

    // Qualifying cart → the percentage comes off every slot in it.
    const lines: DiscountLine[] = [];
    ctx.segments.forEach((seg, i) => {
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
      help: "Total hours across the booking needed to qualify — courts combine (e.g. 3 courts × 1 hr = 3).",
    },
    {
      name: "percentOff",
      label: "Discount %",
      kind: "number",
      required: true,
      help: "Percent off every slot once the booking qualifies (1–100).",
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
