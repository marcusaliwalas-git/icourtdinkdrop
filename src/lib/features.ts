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
  {
    key: "expenses",
    label: "Expenses",
    description: "The admin Expenses tracker and the net-profit figures on the Sales report.",
  },
  {
    key: "official_members",
    label: "Official members",
    description:
      "Tag members as official (annual) to grant the member rate and a longer booking window, plus the member/non-member split on Sales.",
  },
  {
    key: "equipment",
    label: "Equipment rental",
    description:
      "Rent out gear by the hour (paddles, ball machines, …) as a booking add-on, with per-item stock limits, plus the admin Equipment manager.",
  },
  {
    key: "store",
    label: "Retail / concessions",
    description:
      "Sell non-court items (water, food, merch) at the front desk, with a product catalog under Setup and retail revenue on the Sales report. Off by default — turn on per venue.",
  },
] as const;

export type VenueFeatureKey = (typeof VENUE_FEATURES)[number]["key"];

/** Capabilities that are OPT-IN: off until a venue is explicitly switched on (the opposite of the
 * normal default). Everything not listed here is on unless explicitly turned off. */
export const OPT_IN_FEATURES: VenueFeatureKey[] = ["store"];

export function isOptInFeature(key: VenueFeatureKey): boolean {
  return OPT_IN_FEATURES.includes(key);
}

/** Whether a capability is on for a venue. Normal capabilities are on unless venues.features says
 * false (so existing venues and any new key default on). Opt-in capabilities (see OPT_IN_FEATURES)
 * are off unless venues.features explicitly says true, so they never appear until enabled. */
export function featureEnabled(features: unknown, key: VenueFeatureKey): boolean {
  const value =
    features && typeof features === "object" ? (features as Record<string, unknown>)[key] : undefined;
  return isOptInFeature(key) ? value === true : value !== false;
}
