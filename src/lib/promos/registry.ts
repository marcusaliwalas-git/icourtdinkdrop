import type { PromoType } from "./engine";
import { volumeDiscount } from "./types/volume-discount";

// The single source of truth for which promo kinds exist. Adding a new kind = implement a PromoType in
// ./types/<name>.ts and add one line here; the engine and (future) admin form pick it up automatically.
export const PROMO_TYPES: Record<string, PromoType> = {
  [volumeDiscount.key]: volumeDiscount as PromoType,
};
