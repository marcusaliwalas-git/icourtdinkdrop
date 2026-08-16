"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fromZonedTime } from "date-fns-tz";
import { sessionSchema } from "@/lib/validation/session";

type ActionResult = { error?: string; success?: boolean; id?: string };

const VALID_STATUSES = ["draft", "published", "cancelled", "completed"] as const;
type SessionStatus = (typeof VALID_STATUSES)[number];

async function logAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string | undefined,
  action: string,
  entityId: string | null,
  after: unknown
) {
  await supabase.from("audit_log").insert({
    actor_id: actorId ?? null,
    action,
    entity: "session",
    entity_id: entityId,
    after,
  });
}

export async function upsertSession(
  sessionId: string | null,
  input: unknown
): Promise<ActionResult> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { supabase, user } = await requireAdmin();

  // Resolve the wall-clock datetimes against the venue's own timezone.
  const { data: venue } = await supabase
    .from("venues")
    .select("timezone")
    .eq("id", data.venueId)
    .single();
  const timezone = venue?.timezone ?? "Asia/Manila";
  const startsAt = fromZonedTime(`${data.startsAtLocal}:00`, timezone);
  const endsAt = fromZonedTime(`${data.endsAtLocal}:00`, timezone);
  if (endsAt <= startsAt) {
    return { error: "The session must end after it starts." };
  }

  // Guard the assigned courts belong to this venue, so a stray id can't slip in.
  const { data: courts } = await supabase
    .from("courts")
    .select("id")
    .eq("venue_id", data.venueId)
    .in("id", data.courtIds);
  if (!courts || courts.length !== data.courtIds.length) {
    return { error: "One of the selected courts isn't part of this venue." };
  }

  const row = {
    venue_id: data.venueId,
    title: data.title,
    description: data.description ?? null,
    format: data.format,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    capacity: data.capacity,
    price_cents: data.priceCents,
    courts_used: data.courtIds,
    host_id: data.hostId ?? null,
  };

  const { data: saved, error } = sessionId
    ? await supabase.from("sessions").update(row).eq("id", sessionId).select("id").single()
    : await supabase.from("sessions").insert(row).select("id").single();

  if (error) return { error: error.message };

  // Assigning someone to host a session IS how an admin grants organizer access: bump a plain
  // player up to 'organizer' so the capability follows the assignment. The role guard permits
  // it because this runs in an admin session. Never demote here — only ever raise a player.
  if (data.hostId) {
    const { data: hostProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.hostId)
      .single();
    if (hostProfile?.role === "player") {
      await supabase.from("profiles").update({ role: "organizer" }).eq("id", data.hostId);
      await logAudit(supabase, user.id, "profile_promoted_organizer", data.hostId, {
        role: "organizer",
        reason: "session_host_assignment",
      });
    }
  }

  await logAudit(supabase, user.id, sessionId ? "session_updated" : "session_created", saved.id, row);
  revalidatePath("/admin/sessions");
  if (sessionId) revalidatePath(`/admin/sessions/${sessionId}`);
  return { success: true, id: saved.id };
}

export async function setSessionStatus(
  sessionId: string,
  status: SessionStatus
): Promise<ActionResult> {
  if (!VALID_STATUSES.includes(status)) return { error: "Invalid status." };

  const { supabase, user } = await requireAdmin();
  const { error } = await supabase.from("sessions").update({ status }).eq("id", sessionId);
  if (error) return { error: error.message };

  await logAudit(supabase, user.id, "session_status_changed", sessionId, { status });
  revalidatePath("/admin/sessions");
  revalidatePath(`/admin/sessions/${sessionId}`);
  return { success: true };
}
