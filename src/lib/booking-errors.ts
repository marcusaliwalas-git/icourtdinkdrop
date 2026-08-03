const MESSAGES: Record<string, string> = {
  INVALID_DURATION: "Please choose a valid duration.",
  GUEST_INFO_REQUIRED: "Enter your name and mobile number to book as a guest.",
  COURT_NOT_FOUND: "That court isn't available.",
  LEAD_TIME_TOO_SHORT: "This slot starts too soon — please choose a later time.",
  OUTSIDE_BOOKING_WINDOW: "That date is too far ahead to book yet.",
  OUTSIDE_OPERATING_HOURS: "The venue is closed at that time.",
  COURT_CLOSED: "This court is closed for that time (maintenance or event).",
  NOT_FOUND: "Booking not found.",
  NOT_AUTHORIZED: "You're not authorized to do that.",
  ALREADY_FINAL: "This booking is already finished and can't be cancelled.",
  ALREADY_STARTED: "This booking has already started and can't be cancelled.",
  BOOKING_RESTRICTED: "This member's booking privileges are currently restricted.",
  INVALID_STATUS: "Only confirmed bookings can be marked as no-show.",
  NOT_STARTED_YET: "This booking hasn't started yet.",
  NOT_PENDING: "This booking is not awaiting confirmation.",
  PAYMENT_PROOF_REQUIRED: "Enter your payment reference and attach proof of payment.",
};

/** Maps a Postgres/PostgREST error (from an RPC call) to a stable code + friendly message. */
export function mapBookingError(error: { message?: string; code?: string } | null | undefined): {
  code: string;
  message: string;
} {
  if (error?.code === "23P01") {
    return { code: "SLOT_TAKEN", message: "Sorry, that slot was just taken. Pick another." };
  }
  const key = error?.message?.trim();
  if (key && MESSAGES[key]) {
    return { code: key, message: MESSAGES[key] };
  }
  return { code: "UNKNOWN", message: "Something went wrong. Please try again." };
}
