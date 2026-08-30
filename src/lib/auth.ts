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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, venue_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  // Admins are scoped to their own tenant: on another venue's host, they're not an admin here.
  const tenant = await getTenant();
  if (tenant && profile.venue_id && profile.venue_id !== tenant.id) {
    redirect("/");
  }

  return { supabase, user };
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
