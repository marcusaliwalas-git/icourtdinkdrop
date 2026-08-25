"use server";

import { createClient } from "@/lib/supabase/server";
import { fromZonedTime } from "date-fns-tz";
import { coachRequestSchema } from "@/lib/validation/coach";

export type CoachRequestResult = { success: true } | { success: false; message: string };

export async function requestCoach(input: unknown): Promise<CoachRequestResult> {
  const parsed = coachRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Resolve the preferred wall-clock time (if given) against the coach's venue timezone.
  let preferredAt: string | null = null;
  if (d.preferredAtLocal) {
    const { data: coach } = await supabase.from("coaches").select("venue_id").eq("id", d.coachId).single();
    const { data: venue } = coach
      ? await supabase.from("venues").select("timezone").eq("id", coach.venue_id).single()
      : { data: null };
    preferredAt = fromZonedTime(`${d.preferredAtLocal}:00`, venue?.timezone ?? "Asia/Manila").toISOString();
  }

  const { error } = await supabase.from("coach_requests").insert({
    coach_id: d.coachId,
    profile_id: user?.id ?? null,
    guest_name: user ? null : d.guestName ?? null,
    guest_phone: user ? null : d.guestPhone ?? null,
    guest_email: user ? null : d.guestEmail || null,
    preferred_at: preferredAt,
    message: d.message ?? null,
  });

  if (error) {
    return { success: false, message: "Couldn't submit your request. Please try again." };
  }
  return { success: true };
}
