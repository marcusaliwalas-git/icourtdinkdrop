import { z } from "zod";
import { audienceOf, type PromoType, type DiscountLine } from "../engine";

// "Book at least N hours → a percentage off, for the chosen audiences." How the minimum counts is set
// per promo:
//   combined  (default) — hours across every court in the cart add up to the minimum, and once it's
//                         met every slot gets the discount. e.g. Court 1, 2 and 3 for 1 hour each = 3.
//   per_court           — each court must reach the minimum on its own; only those courts are
//                         discounted. e.g. a single 3-hour court booking.
// Example: minHours 3, percentOff 15, audiences [guest, signed_in], combined → a non-member booking
// totalling 3+ hours (one long booking, or several shorter ones across courts) gets 15% off every slot.

const AUDIENCES = ["guest", "signed_in", "member"] as const;

const configSchema = z.object({
  minHours: z.number().int().min(1),
  percentOff: z.number().int().min(1).max(100),
  // How the minimum is counted. Absent on older promos → treated as "combined" (the prior behaviour).
  hoursScope: z.enum(["combined", "per_court"]).optional(),
  // Who the deal applies to. Empty is treated as "everyone" for safety, but the form requires a pick.
  audiences: z.array(z.enum(AUDIENCES)).default([]),
});

export type PercentDiscountConfig = z.infer<typeof configSchema>;

export const percentDiscount: PromoType<PercentDiscountConfig> = {
  key: "percent_discount",
  label: "Percentage off (min hours)",
  scope: "cart", // combined mode needs the whole cart, so the handler always sees every segment
  ownsAudience: true, // audience is chosen via the "Applies to" field, not the shared Eligibility control
  configSchema,

  apply(ctx, cfg, promo): DiscountLine[] {
    // Audience gate: an empty list means everyone; otherwise the booker's bucket must be included.
    if (cfg.audiences.length > 0 && !cfg.audiences.includes(audienceOf(ctx))) return [];

    const lines: DiscountLine[] = [];
    const discount = (seg: { baseTotalCents: number }, i: number) => {
      const cents = Math.round((seg.baseTotalCents * cfg.percentOff) / 100);
      if (cents > 0) lines.push({ segmentIndex: i, cents, promotionId: promo.id, label: promo.name });
    };

    if (cfg.hoursScope === "per_court") {
      // Each court qualifies on its own hours; only the ones meeting the minimum are discounted.
      ctx.segments.forEach((seg, i) => {
        if (seg.durationMinutes / 60 >= cfg.minHours) discount(seg, i);
      });
    } else {
      // Combined (default): total hours across every court count; if the cart qualifies, discount all.
      const totalMinutes = ctx.segments.reduce((sum, s) => sum + s.durationMinutes, 0);
      if (totalMinutes / 60 >= cfg.minHours) ctx.segments.forEach(discount);
    }
    return lines;
  },

  formFields: [
    {
      name: "minHours",
      label: "Minimum hours",
      kind: "number",
      required: true,
      help: "Hours needed to qualify (e.g. 3). How courts count toward this is set below.",
    },
    {
      name: "hoursScope",
      label: "Minimum applies to",
      kind: "select",
      required: true,
      help: "Combined — hours across every court in the booking add up to the minimum, and all slots are discounted. Each court separately — a court must reach the minimum on its own to be discounted.",
      options: [
        { value: "combined", label: "Combined across courts" },
        { value: "per_court", label: "Each court separately" },
      ],
    },
    {
      name: "percentOff",
      label: "Discount %",
      kind: "number",
      required: true,
      help: "Percent off every qualifying slot (1–100).",
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
