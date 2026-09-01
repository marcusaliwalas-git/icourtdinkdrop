import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  // Admin of the *current* venue (the host they're on). Prefer the venue_memberships join table
  // (multi-venue Step 3), fall back to the legacy profiles.role + venue_id while both models coexist.
  const tenant = await getTenant();
  let ok = false;
  if (tenant) {
    const { data: vm } = await supabase
      .from("venue_memberships")
      .select("role")
      .eq("profile_id", user.id)
      .eq("venue_id", tenant.id)
      .maybeSingle();
    ok = vm?.role === "admin";
  }
  if (!ok) {
    const { data: profile } = await supabase.from("profiles").select("role, venue_id").eq("id", user.id).single();
    ok = profile?.role === "admin" && (!tenant || !profile.venue_id || profile.venue_id === tenant.id);
  }
  if (!ok) {
    redirect("/");
  }

  return { supabase, user };
}

/** Whether the current user is an admin of the *current* venue (the resolved host). Boolean
 * version of requireAdmin, for conditionally showing the header's Admin link. Same dual-read:
 * venue_memberships first, legacy profiles.role + venue_id as fallback. */
export async function isVenueAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const tenant = await getTenant();
  if (tenant) {
    const { data: vm } = await supabase
      .from("venue_memberships")
      .select("role")
      .eq("profile_id", user.id)
      .eq("venue_id", tenant.id)
      .maybeSingle();
    if (vm?.role === "admin") return true;
  }
  const { data: profile } = await supabase.from("profiles").select("role, venue_id").eq("id", user.id).single();
  return profile?.role === "admin" && (!tenant || !profile.venue_id || profile.venue_id === tenant.id);
}

/** Gate for platform-level pages (tenant onboarding). A super admin operates the whole
 * deployment and is not scoped to any single venue. */
export async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/superadmin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_super_admin) {
    redirect("/");
  }

  return { supabase, user };
}

/** Whether the current user is a platform super admin — for conditionally showing the link. */
export async function isSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  return !!data?.is_super_admin;
}
