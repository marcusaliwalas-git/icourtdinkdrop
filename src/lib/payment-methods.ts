/** How a booking was paid, distinct from payment_status (whether it's paid). Recorded mainly for
 * walk-ins so the owner can reconcile cash against e-wallet/bank takings. Keep in sync with the
 * check constraint on bookings.payment_method. */
export const PAYMENT_METHODS = ["cash", "gcash", "bank_transfer"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank transfer",
};

/** Human label for a stored method value (falls back to the raw value for anything unexpected). */
export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return PAYMENT_METHOD_LABELS[value as PaymentMethod] ?? value;
}
