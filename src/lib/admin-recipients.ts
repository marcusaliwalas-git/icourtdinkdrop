import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Email addresses of every admin, for review notifications. Uses the service-role client
 * because a member/anon request session can neither read other users' profiles (RLS) nor
 * `auth.users` at all — the same reason adminConfirmBooking looks emails up this way.
 */
export async function getAdminEmails(): Promise<string[]> {
  const adminClient = createAdminClient();
  const { data: admins } = await adminClient.from("profiles").select("id").eq("role", "admin");
  if (!admins?.length) return [];

  const emails = await Promise.all(
    admins.map(async (a) => {
      const { data } = await adminClient.auth.admin.getUserById(a.id);
      return data?.user?.email ?? null;
    })
  );
  return emails.filter((email): email is string => !!email);
}
