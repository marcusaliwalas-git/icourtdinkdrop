"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { formatInTimezone } from "@/lib/time";

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

/**
 * Promote a venue member to front-desk staff, or demote back to a regular member. Runs the
 * set_membership_role RPC, which is admin-only (is_admin_of the venue), can only set player or
 * front_desk (never admin), and refuses to touch an existing admin's row.
 */
export async function setMemberFrontDesk(profileId: string, makeFrontDesk: boolean): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();
  const venue = await getTenant();
  if (!venue) return { error: "No venue in context." };

  const role = makeFrontDesk ? "front_desk" : "player";
  const { error } = await supabase.rpc("set_membership_role", {
    p_venue: venue.id,
    p_profile: profileId,
    p_role: role,
  });
  if (error) return { error: error.message };

  await logAudit(supabase, user.id, makeFrontDesk ? "front_desk_assigned" : "front_desk_removed", profileId, null, {
    role,
  });
  revalidatePath("/admin/members");
  return { success: true };
}

/**
 * Tag a member as an official (annual) member of the current venue: grant an active membership row
 * ending on `endsOn`. One active membership at a time — any existing active one is cancelled first.
 * RLS (memberships_admin_write = is_admin_of) restricts this to a venue admin.
 */
export async function grantOfficialMembership(profileId: string, endsOn: string): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();
  const venue = await getTenant();
  if (!venue) return { error: "No venue in context." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return { error: "Enter a valid end date." };

  const today = formatInTimezone(new Date(), "yyyy-MM-dd", venue.timezone);
  if (endsOn < today) return { error: "End date can't be in the past." };

  // Keep a single active membership per member+venue.
  await supabase
    .from("memberships")
    .update({ status: "cancelled" })
    .eq("profile_id", profileId)
    .eq("venue_id", venue.id)
    .eq("status", "active");

  const { error } = await supabase.from("memberships").insert({
    profile_id: profileId,
    venue_id: venue.id,
    tier: "official",
    starts_on: today,
    ends_on: endsOn,
    status: "active",
  });
  if (error) return { error: error.message };

  await logAudit(supabase, user.id, "official_membership_granted", profileId, null, { ends_on: endsOn });
  revalidatePath(`/admin/members/${profileId}`);
  revalidatePath("/admin/members");
  return { success: true };
}

/** Remove official-member status: cancel the member's active membership at this venue. */
export async function endOfficialMembership(profileId: string): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();
  const venue = await getTenant();
  if (!venue) return { error: "No venue in context." };

  const today = formatInTimezone(new Date(), "yyyy-MM-dd", venue.timezone);
  const { error } = await supabase
    .from("memberships")
    .update({ status: "cancelled", ends_on: today })
    .eq("profile_id", profileId)
    .eq("venue_id", venue.id)
    .eq("status", "active");
  if (error) return { error: error.message };

  await logAudit(supabase, user.id, "official_membership_ended", profileId, null, { ends_on: today });
  revalidatePath(`/admin/members/${profileId}`);
  revalidatePath("/admin/members");
  return { success: true };
}
