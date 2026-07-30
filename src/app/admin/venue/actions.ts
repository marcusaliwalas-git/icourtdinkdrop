"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  venueSchema,
  courtSchema,
  operatingHoursSchema,
  operatingHoursUpdateSchema,
  closureSchema,
  ratePeriodSchema,
} from "@/lib/validation/venue";

type ActionResult = { error?: string; success?: boolean };

async function logAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string | undefined,
  action: string,
  entity: string,
  entityId: string | null,
  after: unknown
) {
  await supabase.from("audit_log").insert({
    actor_id: actorId ?? null,
    action,
    entity,
    entity_id: entityId,
    after,
  });
}

export async function upsertVenue(
  venueId: string | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = venueSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    timezone: formData.get("timezone") || "Asia/Manila",
    contact: formData.get("contact") || undefined,
    minLeadMinutes: Number(formData.get("minLeadMinutes")),
    maxAdvanceDays: Number(formData.get("maxAdvanceDays")),
    cancellationCutoffHours: Number(formData.get("cancellationCutoffHours")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    name: parsed.data.name,
    address: parsed.data.address ?? null,
    timezone: parsed.data.timezone,
    contact: parsed.data.contact ?? null,
    min_lead_minutes: parsed.data.minLeadMinutes,
    max_advance_days: parsed.data.maxAdvanceDays,
    cancellation_cutoff_hours: parsed.data.cancellationCutoffHours,
  };

  const { data, error } = venueId
    ? await supabase.from("venues").update(row).eq("id", venueId).select("id").single()
    : await supabase.from("venues").insert(row).select("id").single();

  if (error) return { error: error.message };

  await logAudit(supabase, user?.id, venueId ? "venue_updated" : "venue_created", "venue", data.id, row);
  revalidatePath("/admin/venue");
  return { success: true };
}

export async function upsertCourt(
  courtId: string | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = courtSchema.safeParse({
    venueId: formData.get("venueId"),
    name: formData.get("name"),
    surface: formData.get("surface") || undefined,
    isIndoor: formData.get("isIndoor") === "on",
    hourlyRateCents: Math.round(Number(formData.get("hourlyRate")) * 100),
    memberRateCents: formData.get("memberRate")
      ? Math.round(Number(formData.get("memberRate")) * 100)
      : undefined,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    venue_id: parsed.data.venueId,
    name: parsed.data.name,
    surface: parsed.data.surface ?? null,
    is_indoor: parsed.data.isIndoor,
    hourly_rate_cents: parsed.data.hourlyRateCents,
    member_rate_cents: parsed.data.memberRateCents ?? null,
    is_active: parsed.data.isActive,
  };

  const { data, error } = courtId
    ? await supabase.from("courts").update(row).eq("id", courtId).select("id").single()
    : await supabase.from("courts").insert(row).select("id").single();

  if (error) return { error: error.message };

  await logAudit(supabase, user?.id, courtId ? "court_updated" : "court_created", "court", data.id, row);
  revalidatePath("/admin/venue");
  return { success: true };
}

export async function addOperatingHours(formData: FormData): Promise<ActionResult> {
  const parsed = operatingHoursSchema.safeParse({
    venueId: formData.get("venueId"),
    dayOfWeek: Number(formData.get("dayOfWeek")),
    openTime: formData.get("openTime"),
    closeTime: formData.get("closeTime"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("operating_hours").insert({
    venue_id: parsed.data.venueId,
    day_of_week: parsed.data.dayOfWeek,
    open_time: parsed.data.openTime,
    close_time: parsed.data.closeTime,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/venue");
  return { success: true };
}

export async function updateOperatingHours(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = operatingHoursUpdateSchema.safeParse({
    dayOfWeek: Number(formData.get("dayOfWeek")),
    openTime: formData.get("openTime"),
    closeTime: formData.get("closeTime"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.closeTime <= parsed.data.openTime) {
    return { error: "Close time must be after open time." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("operating_hours")
    .update({
      day_of_week: parsed.data.dayOfWeek,
      open_time: parsed.data.openTime,
      close_time: parsed.data.closeTime,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/venue");
  return { success: true };
}

export async function deleteOperatingHours(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("operating_hours").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/venue");
  return { success: true };
}

export async function addClosure(formData: FormData): Promise<ActionResult> {
  const parsed = closureSchema.safeParse({
    venueId: formData.get("venueId"),
    courtId: formData.get("courtId") || null,
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("closures")
    .insert({
      venue_id: parsed.data.venueId,
      court_id: parsed.data.courtId,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      reason: parsed.data.reason ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  await logAudit(supabase, user?.id, "closure_created", "closure", data.id, parsed.data);
  revalidatePath("/admin/venue");
  return { success: true };
}

export async function deleteClosure(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("closures").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/venue");
  return { success: true };
}

export async function addRatePeriod(formData: FormData): Promise<ActionResult> {
  const parsed = ratePeriodSchema.safeParse({
    courtId: formData.get("courtId"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    hourlyRateCents: Math.round(Number(formData.get("hourlyRate")) * 100),
    memberRateCents: formData.get("memberRate")
      ? Math.round(Number(formData.get("memberRate")) * 100)
      : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.endTime <= parsed.data.startTime) {
    return { error: "End time must be after start time." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("court_rate_periods").insert({
    court_id: parsed.data.courtId,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
    hourly_rate_cents: parsed.data.hourlyRateCents,
    member_rate_cents: parsed.data.memberRateCents ?? null,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/venue");
  return { success: true };
}

export async function deleteRatePeriod(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("court_rate_periods").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/venue");
  return { success: true };
}
