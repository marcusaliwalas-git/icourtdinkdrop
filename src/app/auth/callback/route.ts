import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenant } from "@/lib/tenant";

// OAuth (Google) landing route: signInWithOAuth redirects here with a `code` to exchange.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // OAuth signups don't carry our signup metadata, so a first-time Google user's profile has
      // no venue yet. Pin them to the tenant whose site they signed in on — via the service-role
      // client (bypasses the self-update freeze), and only when unset so an existing member is
      // never moved between tenants.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const tenant = await getTenant();
      if (user && tenant) {
        const admin = createAdminClient();
        await admin.from("profiles").update({ venue_id: tenant.id }).eq("id", user.id).is("venue_id", null);
        // Dual-write the join table (Step 2) so this user is a member of the tenant they signed in on.
        await admin
          .from("venue_memberships")
          .upsert(
            { profile_id: user.id, venue_id: tenant.id, role: "player" },
            { onConflict: "profile_id,venue_id", ignoreDuplicates: true }
          );
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
