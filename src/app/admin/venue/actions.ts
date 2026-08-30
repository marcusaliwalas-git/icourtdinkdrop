"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/validation/tenant";
import {
  venueSchema,
  courtSchema,
  operatingHoursSchema,
  operatingHoursUpdateSchema,
  closureSchema,
  ratePeriodSchema,
  paymentAccountSchema,
  paymentAccountUpdateSchema,
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
    logoUrl: formData.get("logoUrl") || undefined,
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
    logo_url: parsed.data.logoUrl || null,
    address: parsed.data.address ?? null,
    timezone: parsed.data.timezone,
    contact: parsed.data.contact ?? null,
    min_lead_minutes: parsed.data.minLeadMinutes,
    max_advance_days: parsed.data.maxAdvanceDays,
    cancellation_cutoff_hours: parsed.data.cancellationCutoffHours,
  };

  // Editing an existing venue: RLS lets an admin update their own venue.
  if (venueId) {
    const { data, error } = await supabase.from("venues").update(row).eq("id", venueId).select("id").single();
    if (error) return { error: error.message };
    await logAudit(supabase, user?.id, "venue_updated", "venue", data.id, row);
    revalidatePath("/admin/venue");
    return { success: true };
  }

  // Creating a venue can't go through RLS — the new row's id can't equal the creator's current
  // venue (venues_admin_write requires id = current_user_venue()). So verify the caller is a
  // bootstrapping admin, then create it with the service-role client and link them to it so
  // their later edits pass RLS. (Multiple venues at once are a super-admin job via /superadmin.)
  if (!user) return { error: "You need to be signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, venue_id, is_super_admin")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "admin" && !profile.is_super_admin)) {
    return { error: "Only an admin can create a venue." };
  }
  if (profile.venue_id && !profile.is_super_admin) {
    return { error: "Your account already has a venue. A platform admin can add more from /superadmin." };
  }

  const admin = createAdminClient();
  const base = slugify(row.name) || "venue";
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data: taken } = await admin.from("venues").select("id").eq("slug", slug).maybeSingle();
    if (!taken) break;
    slug = `${base}-${i}`;
  }
  const { data, error } = await admin.from("venues").insert({ ...row, slug }).select("id").single();
  if (error) return { error: error.message };

  // Seed the same starter defaults as super-admin onboarding, so the venue isn't created empty:
  // a full week of 6 AM–10 PM hours and one court to edit. (This is why venues made here used to
  // show up with zero courts/hours.)
  const { error: hoursError } = await admin.from("operating_hours").insert(
    Array.from({ length: 7 }, (_, day) => ({
      venue_id: data.id,
      day_of_week: day,
      open_time: "06:00",
      close_time: "22:00",
    }))
  );
  if (hoursError) return { error: `Venue created, but adding hours failed: ${hoursError.message}` };
  const { error: courtError } = await admin
    .from("courts")
    .insert({ venue_id: data.id, name: "Court 1", hourly_rate_cents: 50000, is_active: true });
  if (courtError) return { error: `Venue created, but adding the starter court failed: ${courtError.message}` };

  // Tie the creator to their new venue (only if they weren't already), so current_user_venue()
  // resolves and RLS lets them manage it from here on.
  if (!profile.venue_id) {
    await admin.from("profiles").update({ venue_id: data.id }).eq("id", user.id);
  }
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "venue_created",
    entity: "venue",
    entity_id: data.id,
    after: row,
  });
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
    closesNextDay: formData.get("closesNextDay") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (!parsed.data.closesNextDay && parsed.data.closeTime <= parsed.data.openTime) {
    return { error: "Close time must be after open time (or mark it as closing the next day)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("operating_hours").insert({
    venue_id: parsed.data.venueId,
    day_of_week: parsed.data.dayOfWeek,
    open_time: parsed.data.openTime,
    close_time: parsed.data.closeTime,
    closes_next_day: parsed.data.closesNextDay,
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
    closesNextDay: formData.get("closesNextDay") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (!parsed.data.closesNextDay && parsed.data.closeTime <= parsed.data.openTime) {
    return { error: "Close time must be after open time (or mark it as closing the next day)." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("operating_hours")
    .update({
      day_of_week: parsed.data.dayOfWeek,
      open_time: parsed.data.openTime,
      close_time: parsed.data.closeTime,
      closes_next_day: parsed.data.closesNextDay,
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

// ── Payment accounts (shown to customers in the booking review) ────────────────
function revalidatePaymentAccounts() {
  revalidatePath("/admin/venue");
  revalidatePath("/book");
}

export async function addPaymentAccount(formData: FormData): Promise<ActionResult> {
  const parsed = paymentAccountSchema.safeParse({
    venueId: formData.get("venueId"),
    bankName: formData.get("bankName"),
    accountName: formData.get("accountName"),
    accountNumber: formData.get("accountNumber"),
    remarks: formData.get("remarks") ?? "",
    sortOrder: Number(formData.get("sortOrder")) || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.from("payment_accounts").insert({
    venue_id: parsed.data.venueId,
    bank_name: parsed.data.bankName,
    account_name: parsed.data.accountName,
    account_number: parsed.data.accountNumber,
    remarks: parsed.data.remarks || null,
    sort_order: parsed.data.sortOrder,
  });
  if (error) return { error: error.message };
  revalidatePaymentAccounts();
  return { success: true };
}

export async function updatePaymentAccount(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = paymentAccountUpdateSchema.safeParse({
    bankName: formData.get("bankName"),
    accountName: formData.get("accountName"),
    accountNumber: formData.get("accountNumber"),
    remarks: formData.get("remarks") ?? "",
    sortOrder: Number(formData.get("sortOrder")) || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_accounts")
    .update({
      bank_name: parsed.data.bankName,
      account_name: parsed.data.accountName,
      account_number: parsed.data.accountNumber,
      remarks: parsed.data.remarks || null,
      sort_order: parsed.data.sortOrder,
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That account isn't for your venue." };
  revalidatePaymentAccounts();
  return { success: true };
}

export async function deletePaymentAccount(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("payment_accounts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePaymentAccounts();
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
