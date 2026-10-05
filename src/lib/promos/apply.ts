import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { parseTstzRange } from "@/lib/availability";
import { formatInTimezone } from "@/lib/time";
import { evaluatePromotions, toPromoRow, totalDiscountCents, type PromoSegment } from "./engine";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/** A just-created booking row, as returned by the create_bookings RPC. */
export interface CreatedBookingRow {
  id: string;
  court_id: string;
  time_range: string;
  total_cents: number; // authoritative base, before any discount
  booking_group_id: string | null;
}

/**
 * Apply the venue's active promotions to a freshly-created cart: evaluate them against the real base
 * totals, then record the resulting discounts via the apply_group_promotions RPC (which caps and
 * guardrails them). Best-effort — a promo failure never fails the booking it discounts. Returns the
 * total discount so the caller can show/charge the discounted amount.
 */
export async function applyCartPromotions(
  supabase: SupabaseServer,
  params: { venueId: string; timezone: string; isMember: boolean; bookings: CreatedBookingRow[] }
): Promise<{ totalDiscountCents: number }> {
  const { venueId, timezone, isMember, bookings } = params;
  if (bookings.length === 0) return { totalDiscountCents: 0 };

  try {
    const { data: promoRows } = await supabase
      .from("promotions")
      .select("id, name, type, config, eligibility, stackable, priority, starts_on, ends_on")
      .eq("venue_id", venueId)
      .eq("active", true);
    if (!promoRows?.length) return { totalDiscountCents: 0 };

    const segments: PromoSegment[] = bookings.map((b) => {
      const { start, end } = parseTstzRange(b.time_range);
      return {
        courtId: b.court_id,
        startsAtIso: start.toISOString(),
        durationMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
        baseTotalCents: b.total_cents,
      };
    });

    // Schedule window is checked against the booking's venue-local date.
    const onDateIso = formatInTimezone(new Date(segments[0].startsAtIso), "yyyy-MM-dd", timezone);
    const lines = evaluatePromotions(
      { venueId, timezone, isMember, onDateIso, segments },
      promoRows.map(toPromoRow)
    );
    if (lines.length === 0) return { totalDiscountCents: 0 };

    const p_discounts = lines.map((l) => ({
      booking_id: bookings[l.segmentIndex].id,
      cents: l.cents,
      promotion_id: l.promotionId,
      label: l.label,
    }));

    // p_group_id is kept for signature stability; the RPC now matches by booking id (so an ungrouped
    // single walk-in is discounted too). Pass the group when there is one.
    const p_group_id = bookings[0].booking_group_id;
    const { error } = await supabase.rpc("apply_group_promotions", { p_group_id, p_discounts });
    if (error) {
      console.error("apply_group_promotions failed:", error);
      return { totalDiscountCents: 0 };
    }
    return { totalDiscountCents: totalDiscountCents(lines) };
  } catch (err) {
    console.error("applyCartPromotions failed:", err);
    return { totalDiscountCents: 0 };
  }
}
