"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";

type ActionResult = { error?: string; success?: boolean };

async function logAudit(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  actorId: string,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown
) {
  // A profile can belong to several venues, so stamp the audit row with the venue the action is
  // happening in (the current host) rather than leaving the trigger to guess the member's home venue.
  const venue = await getTenant();
  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity: "profile",
    entity_id: entityId,
    venue_id: venue?.id ?? null,
    before,
    after,
  });
}

export async function resetNoShowCount(profileId: string): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();

  const { error } = await supabase.from("profiles").update({ no_show_count: 0 }).eq("id", profileId);
  if (error) return { error: error.message };

  await logAudit(supabase, user.id, "no_show_count_reset", profileId, null, { no_show_count: 0 });
  revalidatePath(`/admin/members/${profileId}`);
  revalidatePath("/admin/members");
  return { success: true };
}

export async function setBookingRestriction(
  profileId: string,
  untilDate: string | null
): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();

  const { error } = await supabase
    .from("profiles")
    .update({ booking_restricted_until: untilDate })
    .eq("id", profileId);
  if (error) return { error: error.message };

  await logAudit(
    supabase,
    user.id,
    untilDate ? "booking_restriction_applied" : "booking_restriction_lifted",
    profileId,
    null,
    { booking_restricted_until: untilDate }
  );
  revalidatePath(`/admin/members/${profileId}`);
  revalidatePath("/admin/members");
  return { success: true };
}
