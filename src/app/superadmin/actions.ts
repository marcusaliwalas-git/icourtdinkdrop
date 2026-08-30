"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTenantSchema } from "@/lib/validation/tenant";

type Result = { error?: string; success?: boolean; venueId?: string };

/**
 * Onboard a new tenant + its first admin — the UI equivalent of supabase/create-tenant.ts.
 * Gated to platform super admins, then performed with the service-role client (the privileged
 * writes — venue insert, auth user creation, role promotion — are not something RLS should allow
 * a normal request to do).
 */
export async function createTenant(input: unknown): Promise<Result> {
  const parsed = createTenantSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  await requireSuperAdmin();
  const admin = createAdminClient();

  // 1. The venue (tenant).
  const { data: venue, error: venueErr } = await admin
    .from("venues")
    .insert({ name: d.name, slug: d.slug, custom_domain: d.customDomain || null, timezone: d.timezone })
    .select("id")
    .single();
  if (venueErr) {
    if (venueErr.code === "23505") {
      return {
        error: venueErr.message.includes("custom_domain")
          ? "That custom domain is already in use."
          : "That slug is already taken.",
      };
    }
    return { error: venueErr.message };
  }
  const venueId = venue.id as string;

  // 2. Sensible defaults so the new site isn't empty.
  await admin.from("operating_hours").insert(
    Array.from({ length: 7 }, (_, day) => ({
      venue_id: venueId,
      day_of_week: day,
      open_time: "06:00",
      close_time: "22:00",
    }))
  );
  await admin.from("courts").insert({ venue_id: venueId, name: "Court 1", hourly_rate_cents: 50000, is_active: true });

  // 3. The venue's first admin — venue_id in metadata pins them via handle_new_user, then promote.
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: d.adminEmail,
    password: d.adminPassword,
    email_confirm: true,
    user_metadata: { venue_id: venueId },
  });
  if (userErr || !created.user) {
    // Roll back the orphaned venue (cascades to the hours/court) so a retry is clean.
    await admin.from("venues").delete().eq("id", venueId);
    const dup = userErr?.message?.toLowerCase().includes("already");
    return { error: dup ? "That admin email already has an account." : userErr?.message ?? "Could not create the admin." };
  }
  const { error: roleErr } = await admin
    .from("profiles")
    .update({ role: "admin", venue_id: venueId })
    .eq("id", created.user.id);
  if (roleErr) return { error: `Venue created, but promoting the admin failed: ${roleErr.message}` };

  revalidatePath("/superadmin");
  return { success: true, venueId };
}
