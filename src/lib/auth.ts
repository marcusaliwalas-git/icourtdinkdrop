import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  return { supabase, user };
}

/**
 * Gate a host route. A user may run a session if they're an admin, or the organizer this
 * session is assigned to (sessions.host_id). We lean on RLS to decide: the sessions_host_select
 * / *_admin_all policies mean the row is only readable by exactly those two, so a successful
 * select IS the authorization — no separate role branch to keep in sync. Returns the session
 * row so the caller doesn't re-fetch it.
 */
export async function requireSessionHost(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/host/sessions/${sessionId}`);
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    // Either it doesn't exist or this user isn't its host/an admin — RLS can't tell us which,
    // and we don't want to leak that difference. Send them to their host home.
    redirect("/host");
  }

  return { supabase, user, session };
}
