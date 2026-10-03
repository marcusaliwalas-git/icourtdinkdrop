// Turns a raw audit row (machine action + JSON payload) into a plain-English sentence for the audit
// log UI — "Updated membership plan "Basic" · ₱1,500" instead of `membership_plan_updated`. Pure and
// client-safe: the server page resolves the few IDs that need a lookup (booking reference, member
// name) and passes them in as `ctx`; everything else comes from the `after` payload we already store.

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

function money(cents: unknown): string | null {
  return typeof cents === "number" ? peso.format(cents / 100) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Resolved names the server looked up for this row (IDs the payload doesn't spell out). */
export type AuditContext = {
  /** Customer-facing reference code for a `booking` entity, e.g. "5D16C3C0". */
  bookingRef?: string;
  /** Full name of the member a `membership_request` is for. */
  memberName?: string;
};

export type AuditLike = {
  action: string;
  entity: string;
  entity_id: string | null;
  after: unknown;
};

/** One short, human-readable line describing what happened. Falls back to a prettified action name
 * so a brand-new action type still reads sensibly before it gets its own phrasing. */
export function describeAuditEntry(entry: AuditLike, ctx: AuditContext = {}): string {
  const after = (entry.after ?? {}) as Record<string, unknown>;
  const ref = ctx.bookingRef ?? str(after.reference_code) ?? entry.entity_id?.slice(0, 8) ?? "";
  const member = ctx.memberName ?? "a member";

  // A money suffix like " · ₱1,500", with the sale price appended when one is set.
  const planPrice = () => {
    const base = money(after.price_cents);
    const sale = money(after.sale_price_cents);
    if (base && sale) return ` · ${base} (on sale ${sale})`;
    return base ? ` · ${base}` : "";
  };

  switch (entry.action) {
    // ── Venue & courts ──────────────────────────────────────────────────────
    case "venue_created":
      return `Created venue${str(after.name) ? ` "${str(after.name)}"` : ""}`;
    case "venue_updated":
      return `Updated venue settings${str(after.name) ? ` "${str(after.name)}"` : ""}`;
    case "court_created":
      return `Added court${str(after.name) ? ` "${str(after.name)}"` : ""}`;
    case "court_updated":
      return `Updated court${str(after.name) ? ` "${str(after.name)}"` : ""}`;

    case "operating_hours_created":
    case "operating_hours_updated": {
      const day = typeof after.dayOfWeek === "number" ? DAY_NAMES[after.dayOfWeek] : null;
      const span = str(after.openTime) && str(after.closeTime) ? `${after.openTime}–${after.closeTime}` : null;
      const detail = [day, span].filter(Boolean).join(" ");
      const verb = entry.action === "operating_hours_created" ? "Added" : "Updated";
      return `${verb} operating hours${detail ? ` · ${detail}` : ""}`;
    }
    case "operating_hours_deleted":
      return "Removed operating hours";

    case "payment_account_created":
    case "payment_account_updated": {
      const label = [str(after.bank_name), str(after.account_name)].filter(Boolean).join(" · ");
      const verb = entry.action === "payment_account_created" ? "Added" : "Updated";
      return `${verb} payment account${label ? ` · ${label}` : ""}`;
    }
    case "payment_account_deleted":
      return "Removed a payment account";

    case "membership_plan_created":
      return `Created membership plan${str(after.name) ? ` "${str(after.name)}"` : ""}${planPrice()}`;
    case "membership_plan_updated":
      return `Updated membership plan${str(after.name) ? ` "${str(after.name)}"` : ""}${planPrice()}`;
    case "membership_plan_deleted":
      return "Deleted a membership plan";

    case "promotion_created":
      return `Created promotion${str(after.name) ? ` "${str(after.name)}"` : ""}`;
    case "promotion_updated":
      return `Updated promotion${str(after.name) ? ` "${str(after.name)}"` : ""}`;
    case "promotion_deleted":
      return "Deleted a promotion";

    case "closure_created":
      return `Scheduled a closure${str(after.reason) ? ` · ${str(after.reason)}` : ""}`;
    case "closure_deleted":
      return "Removed a closure";

    case "rate_period_created": {
      const span = str(after.startTime) && str(after.endTime) ? `${after.startTime}–${after.endTime}` : null;
      const rate = money(after.hourlyRateCents);
      const detail = [span, rate ? `${rate}/hr` : null].filter(Boolean).join(" @ ");
      return `Added a rate period${detail ? ` · ${detail}` : ""}`;
    }
    case "rate_period_deleted":
      return "Removed a rate period";

    // ── Subscriptions ───────────────────────────────────────────────────────
    case "membership_request_approved": {
      const tier = str(after.tier);
      const amount = money(after.amount_cents);
      return `Approved ${tier ? `${tier} ` : ""}subscription for ${member}${amount ? ` · ${amount}` : ""}`;
    }
    case "membership_request_rejected": {
      const tier = str(after.tier);
      const reason = str(after.reason);
      return `Rejected ${tier ? `${tier} ` : ""}subscription for ${member}${reason ? ` · ${reason}` : ""}`;
    }

    // ── Bookings (logged by the RPCs; `after` is the full booking row) ────────
    case "booking_created":
      return `Created booking ${ref}${str(after.guest_name) ? ` · ${str(after.guest_name)}` : ""}`;
    case "booking_confirmed":
      return `Confirmed booking ${ref}${str(after.guest_name) ? ` · ${str(after.guest_name)}` : ""}`;
    case "booking_cancelled":
      return `Cancelled booking ${ref}${str(after.guest_name) ? ` · ${str(after.guest_name)}` : ""}`;
    case "booking_voided":
      return `Voided booking ${ref}`;
    case "booking_checked_in":
      return `Checked in booking ${ref}`;
    case "booking_check_in_undone":
      return `Undid check-in · booking ${ref}`;
    case "booking_no_show":
      return `Marked no-show · booking ${ref}`;
    case "booking_rescheduled":
      return `Rescheduled booking ${ref}`;

    default:
      // Unknown action: "some_new_action" → "Some new action".
      return entry.action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}
