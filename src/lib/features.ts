/** Per-venue capability flags, toggled by the platform super admin (see Admin → Platform). A
 * capability defaults ON; it's disabled only when explicitly stored as false on venues.features.
 * Add a key here and it appears in the super-admin toggles and can be gated in the UI/routes. */

export const VENUE_FEATURES = [
  {
    key: "coaches",
    label: "Coaches",
    description: "Public Coaches page, the coach add-on when booking, and the admin Coaches manager.",
  },
  {
    key: "analytics",
    label: "Analytics",
    description: "The admin Sales and Top Customers reports.",
  },
] as const;

export type VenueFeatureKey = (typeof VENUE_FEATURES)[number]["key"];

/** A capability is enabled unless venues.features explicitly says false — so existing venues (and
 * any new key) default on until a super admin turns it off. */
export function featureEnabled(features: unknown, key: VenueFeatureKey): boolean {
  if (!features || typeof features !== "object") return true;
  return (features as Record<string, unknown>)[key] !== false;
}
