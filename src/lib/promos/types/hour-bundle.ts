import { z } from "zod";
import { toZonedTime } from "date-fns-tz";
import type { PromoType, DiscountLine } from "../engine";

// "Book a block of hours on one court within a time window → one flat price for that block; any hours
//  beyond the block bill at the normal rate." Per court-slot.
//
// Example: window 16:00–19:00, bundleHours 3, bundlePrice ₱1,000 → a 3-hour 4–7pm booking on a court
// costs ₱1,000 flat. A 4-hour booking pays ₱1,000 for the first 3 hours + the normal rate for the 4th.
// Fully configurable, so "4 hours for ₱1,200" is just another row. The window may run overnight.

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const configSchema = z
  .object({
    windowStart: hhmm,
    windowEnd: hhmm,
    bundleHours: z.number().int().min(1),
    bundlePriceCents: z.number().int().min(0),
  })
  .refine((c) => c.windowEnd !== c.windowStart, {
    message: "Window start and end can't be the same time.",
  })
  // The bundle block must fit inside the window (overnight windows allowed, so measure modulo 24h).
  .refine(
    (c) => {
      const len = (((toMinutes(c.windowEnd) - toMinutes(c.windowStart)) % 1440) + 1440) % 1440;
      return c.bundleHours * 60 <= len;
    },
    { message: "The bundle hours must fit within the time window.", path: ["bundleHours"] }
  );

export type HourBundleConfig = z.infer<typeof configSchema>;

export const hourBundle: PromoType<HourBundleConfig> = {
  key: "hour_bundle",
  label: "Hour bundle (flat price)",
  scope: "booking", // evaluated per court-slot — the deal is per court
  configSchema,

  apply(ctx, cfg, promo): DiscountLine[] {
    const ws = toMinutes(cfg.windowStart);
    const we = toMinutes(cfg.windowEnd);
    const windowLen = (((we - ws) % 1440) + 1440) % 1440;
    const bundleMins = cfg.bundleHours * 60;

    const lines: DiscountLine[] = [];
    ctx.segments.forEach((seg, i) => {
      if (seg.durationMinutes < bundleMins) return; // must book at least the bundle length

      // The bundle block (the first bundleHours) must start within, and fit inside, the window.
      const local = toZonedTime(new Date(seg.startsAtIso), ctx.timezone);
      const startMin = local.getHours() * 60 + local.getMinutes();
      const offset = (((startMin - ws) % 1440) + 1440) % 1440;
      if (offset + bundleMins > windowLen) return;

      // Price the bundle block at the flat price; any extra hours stay at the normal (average) rate. The
      // discount is the difference between the block's normal price and the flat bundle price — so the
      // booking lands at (bundle price + extra hours at normal rate). Never applied when it isn't a saving
      // (e.g. a member whose rate for the block is already below the bundle price).
      const hours = seg.durationMinutes / 60;
      const bundleBaseCents = Math.round((seg.baseTotalCents * cfg.bundleHours) / hours);
      const cents = bundleBaseCents - cfg.bundlePriceCents;
      if (cents > 0) lines.push({ segmentIndex: i, cents, promotionId: promo.id, label: promo.name });
    });
    return lines;
  },

  formFields: [
    { name: "windowStart", label: "Window start", kind: "time", required: true, help: "e.g. 16:00" },
    { name: "windowEnd", label: "Window end", kind: "time", required: true, help: "e.g. 19:00. An earlier end means overnight." },
    {
      name: "bundleHours",
      label: "Bundle hours",
      kind: "number",
      required: true,
      help: "Hours covered by the flat price (e.g. 3). Extra hours bill at the normal rate.",
    },
    {
      name: "bundlePriceCents",
      label: "Bundle price",
      kind: "money",
      required: true,
      help: "Flat price for the bundle hours, per court (e.g. ₱1,000).",
    },
  ],
};
