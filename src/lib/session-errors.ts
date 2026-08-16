// Maps the raise-exception codes from the Phase 3 session functions to friendly copy, the
// same pattern as booking-errors.ts. Every code here is a `raise exception '...'` in
// 20260816140737_challenge_court_rotation.sql or 20260816160000_session_host_ops.sql.
const MESSAGES: Record<string, string> = {
  NOT_AUTHORIZED: "You're not the host of this session.",
  NOT_FOUND: "That session item no longer exists.",
  SESSION_NOT_LIVE: "This session isn't live right now — publish it and start it within its time window.",
  COURT_NOT_IN_SESSION: "That court isn't part of this session.",
  COURT_IN_USE: "That court already has a match on it.",
  INVALID_MATCH_SIZE: "Pick even teams — 1 v 1 or 2 v 2.",
  PLAYER_NOT_ELIGIBLE: "Everyone playing must be checked in first.",
  PLAYER_ALREADY_PLAYING: "One of those players is already on a court.",
  MATCH_ALREADY_ENDED: "That match is already finished.",
  INVALID_TEAM: "Pick which side won.",
  SIGNUP_NAME_REQUIRED: "Enter a name for the player.",
};

export function mapSessionError(
  error: { message?: string; code?: string } | null | undefined
): { code: string; message: string } {
  if (error?.code === "23505") {
    // The one-live-match-per-court unique index — a race two hosts could trip at once.
    return { code: "COURT_IN_USE", message: MESSAGES.COURT_IN_USE };
  }
  const key = error?.message?.trim();
  if (key && MESSAGES[key]) {
    return { code: key, message: MESSAGES[key] };
  }
  return { code: "UNKNOWN", message: "Something went wrong. Please try again." };
}
