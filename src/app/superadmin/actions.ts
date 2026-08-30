"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTenantSchema, slugify } from "@/lib/validation/tenant";

type Result = { error?: string; success?: boolean; venueId?: string; slug?: string };

// Find a free slug: `base`, else `base-2`, `base-3`, … (slugs are UNIQUE). The insert's own unique
// constraint is the real backstop against a race; this just avoids the obvious collision.
async function uniqueSlug(admin: ReturnType<typeof createAdminClient>, base: string): Promise<string> {
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const { data } = await admin.from("venues").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

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

  // Slug is optional: blank means derive it from the venue name (e.g. a custom-domain-only venue).
  // Still store one — it gives a free <slug>.<root> fallback URL that works while custom-domain DNS
  // propagates. If the name has no usable characters, fall back to "venue".
  const base = (d.slug && d.slug.trim()) || slugify(d.name) || "venue";
  const slug = await uniqueSlug(admin, base);

  // 1. The venue (tenant).
  const { data: venue, error: venueErr } = await admin
    .from("venues")
    .insert({ name: d.name, slug, custom_domain: d.customDomain || null, timezone: d.timezone })
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

  // 2. Sensible defaults so the new site isn't empty — surface failures instead of silently
  //    leaving a venue with no courts/hours.
  const { error: hoursErr } = await admin.from("operating_hours").insert(
    Array.from({ length: 7 }, (_, day) => ({
      venue_id: venueId,
      day_of_week: day,
      open_time: "06:00",
      close_time: "22:00",
    }))
  );
  if (hoursErr) return { error: `Venue created, but adding hours failed: ${hoursErr.message}` };
  const { error: courtErr } = await admin
    .from("courts")
    .insert({ venue_id: venueId, name: "Court 1", hourly_rate_cents: 50000, is_active: true });
  if (courtErr) return { error: `Venue created, but adding the starter court failed: ${courtErr.message}` };

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
  return { success: true, venueId, slug };
}

/**
 * Delete a tenant. Guarded: refuses a venue that has any bookings (deactivate those instead), and
 * won't delete the venue the caller's own account belongs to. Otherwise removes the tenant's member
 * accounts, then the venue (which cascades its courts, hours, closures, coaches, payment accounts,
 * and sections).
 */
export async function deleteTenant(venueId: string): Promise<Result> {
  const { user } = await requireSuperAdmin();
  const admin = createAdminClient();

  const { data: me } = await admin.from("profiles").select("venue_id").eq("id", user.id).single();
  if (me?.venue_id === venueId) {
    return { error: "You can't delete the venue your own account belongs to." };
  }

  // Never delete a venue with real bookings — that's business/financial history.
  const { data: courtRows } = await admin.from("courts").select("id").eq("venue_id", venueId);
  const courtIds = (courtRows ?? []).map((c) => c.id);
  if (courtIds.length) {
    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("court_id", courtIds);
    if (count && count > 0) {
      return { error: `This venue has ${count} booking(s), so it can't be deleted. Deactivate it instead.` };
    }
  }

  // profiles.venue_id blocks the venue delete (NO ACTION), so remove the tenant's own accounts
  // first. deleteUser cascades each profile; it fails if a member has other history (e.g. audit
  // entries), which shouldn't happen for a bookingless venue.
  const { data: members } = await admin.from("profiles").select("id").eq("venue_id", venueId);
  for (const m of members ?? []) {
    const { error } = await admin.auth.admin.deleteUser(m.id);
    if (error) {
      return { error: `Couldn't remove a member account (${error.message}). Clear the venue's members first.` };
    }
  }

  const { error: delErr } = await admin.from("venues").delete().eq("id", venueId);
  if (delErr) return { error: delErr.message };

  revalidatePath("/superadmin");
  return { success: true };
}
