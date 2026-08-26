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
