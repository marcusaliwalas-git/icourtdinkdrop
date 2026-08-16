"use server";

import { createClient } from "@/lib/supabase/server";
import { mapSessionError } from "@/lib/session-errors";

export type SessionActionResult =
  | { success: true }
  | { success: false; code: string; message: string };

// Every write below funnels through a SECURITY DEFINER function gated on is_session_host(),
// so authorization lives in the database — the host (organizer) and any admin are the only
// callers these succeed for. We don't revalidatePath: the run board and admin roster both
// re-fetch via router.refresh() (and the board also gets a realtime nudge).

export async function startMatch(
  sessionId: string,
  courtId: string,
  team1: string[],
  team2: string[]
): Promise<SessionActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("session_start_match", {
    p_session_id: sessionId,
    p_court_id: courtId,
    p_team1: team1,
    p_team2: team2,
  });
  if (error) return { success: false, ...mapSessionError(error) };
  return { success: true };
}

export async function endMatch(
  matchId: string,
  winningTeam: 1 | 2
): Promise<SessionActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("session_end_match", {
    p_match_id: matchId,
    p_winning_team: winningTeam,
  });
  if (error) return { success: false, ...mapSessionError(error) };
  return { success: true };
}

export async function setCheckIn(
  signupId: string,
  checkedIn: boolean
): Promise<SessionActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("session_set_check_in", {
    p_signup_id: signupId,
    p_checked_in: checkedIn,
  });
  if (error) return { success: false, ...mapSessionError(error) };
  return { success: true };
}

export async function addSignup(
  sessionId: string,
  opts: { guestName?: string | null; profileId?: string | null; checkIn?: boolean }
): Promise<SessionActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("session_add_signup", {
    p_session_id: sessionId,
    p_guest_name: opts.guestName ?? null,
    p_profile_id: opts.profileId ?? null,
    p_check_in: opts.checkIn ?? true,
  });
  if (error) return { success: false, ...mapSessionError(error) };
  return { success: true };
}

export async function removeSignup(signupId: string): Promise<SessionActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("session_remove_signup", { p_signup_id: signupId });
  if (error) return { success: false, ...mapSessionError(error) };
  return { success: true };
}
