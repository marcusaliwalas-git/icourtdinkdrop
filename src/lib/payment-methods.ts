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

/** Friendly labels for bookings.payment_status (whether/how a booking is settled), for admin
 * surfaces that would otherwise show the raw token (e.g. "paid_at_venue"). */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pay_at_venue: "Pending payment",
  paid_at_venue: "Paid at venue",
  awaiting_verification: "Awaiting verification",
  paid_online: "Paid online",
  complimentary: "Complimentary",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
};

/** Human label for a stored payment_status (falls back to the raw value for anything unexpected). */
export function paymentStatusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return PAYMENT_STATUS_LABELS[value] ?? value;
}

/** Whether a booking's payment is settled (paid at venue, paid online, or comped). Anything else
 * (pay_at_venue / awaiting_verification) is still owed. */
export function isPaid(status: string | null | undefined): boolean {
  return status === "paid_at_venue" || status === "paid_online" || status === "complimentary";
}

/** One label for the Payment column: prefer how it was paid (Cash / Paid online / Complimentary)
 * when a method was recorded, otherwise fall back to the status (e.g. an online customer booking
 * shows "Paid online" from its status; an unpaid walk-in shows "Pay at venue"). */
export function bookingPaymentLabel(
  method: string | null | undefined,
  status: string | null | undefined
): string {
  if (method) return paymentMethodLabel(method);
  return paymentStatusLabel(status);
}
