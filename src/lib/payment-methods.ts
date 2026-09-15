/** How a booking was paid, distinct from payment_status (whether it's paid). Recorded mainly for
 * walk-ins so the owner can reconcile cash against e-wallet/bank takings. Keep in sync with the
 * check constraint on bookings.payment_method. */
export const PAYMENT_METHODS = ["cash", "online", "complimentary"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  online: "Paid online",
  complimentary: "Complimentary",
};

/** Paid online (GCash / bank transfer) — the admin records the bank + reference in payment_remarks.
 * A named constant so the "show remarks for this method" logic has a single source. */
export const ONLINE_METHOD = "online";

/** Complimentary (comped/free) bookings are settled like a payment but excluded from sales
 * revenue — see lib/sales.ts. Kept as a named constant so the exclusion has a single source. */
export const COMPLIMENTARY_METHOD = "complimentary";

/** Human label for a stored method value (falls back to the raw value for anything unexpected). */
export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return PAYMENT_METHOD_LABELS[value as PaymentMethod] ?? value;
}
