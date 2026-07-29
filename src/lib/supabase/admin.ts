import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client that bypasses RLS entirely. Only for trusted server-side scripts
 * (seeding) — application request handling should use the request-scoped server client
 * (src/lib/supabase/server.ts) or the RPC functions so RLS stays meaningful.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
