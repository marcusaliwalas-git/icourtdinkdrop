import type { ZodType } from "zod";
import { PROMO_TYPES } from "./registry";

// Per-venue, data-driven promotions. Each promo is a row (type + config); the per-type logic lives in
// a handler registered in ./registry. This engine filters the rows that apply (schedule + member
// eligibility), runs each handler, and resolves stacking into a final set of discount lines. It is
// pure (no I/O) so it runs identically for the pre-submit estimate and the authoritative write, and is
// easy to unit-test. See docs/promotions-design.md.

export type PromoEligibility = "all" | "members_only" | "guests_only";

/** A promotions row as loaded for a venue. `config` is validated by its type's schema at apply time. */
export interface PromoRow {
  id: string;
  name: string;
  type: string;
  config: unknown;
  eligibility: PromoEligibility;
  stackable: boolean;
  priority: number;
  startsOn: string | null; // 'YYYY-MM-DD', venue-local
  endsOn: string | null; // 'YYYY-MM-DD', venue-local
}

/** One priced court-slot. Same shape for a single booking (one segment) and a cart (many). */
export interface PromoSegment {
  courtId: string;
  startsAtIso: string;
  durationMinutes: number;
  baseTotalCents: number; // DB-authoritative base for this slot (from create_booking / pricing.ts)
}

export interface PromoContext {
  venueId: string;
  timezone: string;
  isMember: boolean;
  onDateIso: string; // venue-local date ('YYYY-MM-DD') the booking is for — for the schedule window
  segments: PromoSegment[];
}

/** A discount to subtract from one segment. Always positive and already capped to the segment base. */
export interface DiscountLine {
  segmentIndex: number; // index into ctx.segments
  cents: number;
  promotionId: string;
  label: string;
}

export interface PromoFormField {
  name: string; // config key
  label: string;
  kind: "number" | "money" | "time" | "select" | "weekdays";
  required?: boolean;
  options?: { value: string; label: string }[];
  help?: string;
}

/** A promo type: defined once, drives both the engine and the (future) admin form. */
export interface PromoType<C = unknown> {
  key: string;
  label: string;
  scope: "booking" | "cart"; // 'cart' types need to see all segments (e.g. count distinct courts)
  configSchema: ZodType<C>;
  /** Pure: the discount lines this promo produces for this context (may be empty). */
  apply(ctx: PromoContext, cfg: C, promo: PromoRow): DiscountLine[];
  /** Declarative form spec so the admin UI can be generated instead of hand-built per type. */
  formFields: PromoFormField[];
}

export function eligibilityMatches(p: PromoRow, isMember: boolean): boolean {
  return (
    p.eligibility === "all" ||
    (p.eligibility === "members_only" && isMember) ||
    (p.eligibility === "guests_only" && !isMember)
  );
}

export function withinWindow(onDateIso: string, startsOn: string | null, endsOn: string | null): boolean {
  // ISO 'YYYY-MM-DD' strings compare correctly lexicographically.
  if (startsOn && onDateIso < startsOn) return false;
  if (endsOn && onDateIso > endsOn) return false;
  return true;
}

type PromoResult = { promo: PromoRow; lines: DiscountLine[] };

function linesTotal(results: PromoResult[]): number {
  return results.reduce((t, r) => t + r.lines.reduce((s, l) => s + l.cents, 0), 0);
}

/**
 * Resolve which promotions actually apply when several match at once.
 *
 * - All applicable *stackable* promos combine (their discounts sum) — candidate A.
 * - The single best *exclusive* (non-stackable) promo — candidate B (ties broken by priority).
 * - The customer gets whichever yields the larger total discount. This is order-independent and the
 *   least surprising for customers; `priority` only breaks ties between exclusives.
 *
 * Every line is already capped to its segment base by `evaluatePromotions`, so a total can never push
 * a segment below zero.
 */
export function resolveStacking(results: PromoResult[]): DiscountLine[] {
  const stackables = results.filter((r) => r.promo.stackable);
  const exclusives = results.filter((r) => !r.promo.stackable);

  const stackTotal = linesTotal(stackables);
  const bestExclusive = exclusives
    .slice()
    .sort((a, b) => linesTotal([b]) - linesTotal([a]) || b.promo.priority - a.promo.priority)[0];
  const exclusiveTotal = bestExclusive ? linesTotal([bestExclusive]) : 0;

  const chosen = bestExclusive && exclusiveTotal > stackTotal ? [bestExclusive] : stackables;
  return chosen.flatMap((r) => r.lines);
}

/** Evaluate a venue's promotions against a booking/cart and return the discount lines to record. */
export function evaluatePromotions(ctx: PromoContext, promos: PromoRow[]): DiscountLine[] {
  const applicable = promos.filter(
    (p) => withinWindow(ctx.onDateIso, p.startsOn, p.endsOn) && eligibilityMatches(p, ctx.isMember)
  );

  const results: PromoResult[] = applicable
    .map((p) => {
      const type = PROMO_TYPES[p.type as keyof typeof PROMO_TYPES] as PromoType | undefined;
      if (!type) return { promo: p, lines: [] };
      const cfg = type.configSchema.parse(p.config);
      // Cap each line to its segment's base (never negative), and drop zero-value lines.
      const lines = type
        .apply(ctx, cfg, p)
        .map((l) => ({
          ...l,
          cents: Math.max(0, Math.min(l.cents, ctx.segments[l.segmentIndex]?.baseTotalCents ?? 0)),
        }))
        .filter((l) => l.cents > 0);
      return { promo: p, lines };
    })
    .filter((r) => r.lines.length > 0);

  return resolveStacking(results);
}

/** Total discount across all lines — convenience for callers building a cart total. */
export function totalDiscountCents(lines: DiscountLine[]): number {
  return lines.reduce((t, l) => t + l.cents, 0);
}
