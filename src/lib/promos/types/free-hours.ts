import { z } from "zod";
import { toZonedTime } from "date-fns-tz";
import type { PromoType, DiscountLine } from "../engine";

// "Book enough hours on one court within a time window → some hours free."
// Example: window 08:00–16:00, minHours 4, freeHours 1 → a 4-hour daytime booking pays for 3.
// (A discount reduces price; it can't extend the booking's time, so a "free hour" is one hour's
// worth of price taken off a booking that meets the threshold.)

const configSchema = z
  .object({
    windowStart: z.string().regex(/^\d{2}:\d{2}$/), // "HH:MM" local time
    windowEnd: z.string().regex(/^\d{2}:\d{2}$/),
    minHours: z.number().int().min(1), // hours that must be booked to qualify
    freeHours: z.number().int().min(1), // hours taken off (priced at the booking's average hourly rate)
  })
  // End earlier than start means the window runs overnight (e.g. 20:00–02:00). Only an identical start
  // and end is meaningless.
  .refine((c) => c.windowEnd !== c.windowStart, { message: "Window start and end can't be the same time." });

export type FreeHoursConfig = z.infer<typeof configSchema>;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export const freeHours: PromoType<FreeHoursConfig> = {
  key: "free_hours",
  label: "Free hours (time window)",
  scope: "booking", // evaluated per court-slot, independently
  configSchema,

  apply(ctx, cfg, promo): DiscountLine[] {
    const ws = toMinutes(cfg.windowStart);
    const we = toMinutes(cfg.windowEnd);

    const lines: DiscountLine[] = [];
    ctx.segments.forEach((seg, i) => {
      const hours = seg.durationMinutes / 60;
      if (hours < cfg.minHours) return;

      // The whole booking must fall inside the window (local venue time). The window may run overnight
      // (end < start, e.g. 20:00–02:00), so measure the slot's offset from the window start modulo 24h:
      // it fits iff offset + length stays within the window's length.
      const windowLen = (((we - ws) % 1440) + 1440) % 1440; // 1..1439 (start !== end is enforced)
      const local = toZonedTime(new Date(seg.startsAtIso), ctx.timezone);
      const startMin = local.getHours() * 60 + local.getMinutes();
      const offset = (((startMin - ws) % 1440) + 1440) % 1440;
      if (offset + seg.durationMinutes > windowLen) return;

      // Free hours are valued at the booking's average hourly rate (exact for a flat rate; for mixed
      // rate periods it's the average across the booked hours). Capped so it can't exceed the booking.
      const free = Math.min(cfg.freeHours, hours);
      const cents = Math.round((seg.baseTotalCents * free) / hours);
      if (cents > 0) lines.push({ segmentIndex: i, cents, promotionId: promo.id, label: promo.name });
    });
    return lines;
  },

  formFields: [
    { name: "windowStart", label: "Window start", kind: "time", required: true, help: "e.g. 08:00" },
    { name: "windowEnd", label: "Window end", kind: "time", required: true, help: "e.g. 16:00. An earlier end means overnight (e.g. 20:00–02:00)." },
    {
      name: "minHours",
      label: "Hours to book",
      kind: "number",
      required: true,
      help: "Minimum hours on one court to qualify (e.g. 4).",
    },
    {
      name: "freeHours",
      label: "Free hours",
      kind: "number",
      required: true,
      help: "Hours taken off, priced at the hourly rate (e.g. 1).",
    },
  ],
};
