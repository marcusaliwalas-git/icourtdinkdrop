"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { coachSchema } from "@/lib/validation/coach";

type ActionResult = { error?: string; success?: boolean };

export async function upsertCoach(coachId: string | null, input: unknown): Promise<ActionResult> {
  const parsed = coachSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const { supabase, user } = await requireAdmin();

  const row = {
    venue_id: d.venueId,
    name: d.name,
    bio: d.bio ?? null,
    photo_url: d.photoUrl || null,
    hourly_rate_cents: d.hourlyRateCents,
    is_active: d.isActive,
    sort_order: d.sortOrder,
  };

  const { data: saved, error } = coachId
    ? await supabase.from("coaches").update(row).eq("id", coachId).select("id").single()
    : await supabase.from("coaches").insert(row).select("id").single();

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: coachId ? "coach_updated" : "coach_created",
    entity: "coach",
    entity_id: saved.id,
    after: row,
  });
  revalidatePath("/admin/coaches");
  revalidatePath("/coaches");
  return { success: true };
}

export async function deleteCoach(coachId: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("coaches").delete().eq("id", coachId);
  if (error) return { error: error.message };
  revalidatePath("/admin/coaches");
  revalidatePath("/coaches");
  return { success: true };
}

export async function setCoachRequestStatus(
  requestId: string,
  status: "pending" | "confirmed" | "declined"
): Promise<ActionResult> {
  if (!["pending", "confirmed", "declined"].includes(status)) return { error: "Invalid status." };
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("coach_requests").update({ status }).eq("id", requestId);
  if (error) return { error: error.message };
  revalidatePath("/admin/coaches");
  return { success: true };
}
