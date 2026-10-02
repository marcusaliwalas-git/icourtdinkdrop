import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Email addresses of a venue's admins, for review notifications. Scoped to the booking's venue so
 * a notification never reaches another tenant's admins. Uses the service-role client because a
 * member/anon request session can neither read other users' profiles (RLS) nor `auth.users` at all
 * — the same reason adminConfirmBooking looks emails up this way.
 *
 * Admins are read from venue_memberships (role='admin') — the same source RLS uses (is_admin_of).
 * The legacy profiles.role/profiles.venue_id columns aren't kept in sync when an admin is added via
 * membership (the "Add admin" flow only writes venue_memberships), so keying off them here missed
 * those admins entirely and no booking notification was ever sent to them.
 */
export async function getAdminEmails(venueId: string): Promise<string[]> {
  const adminClient = createAdminClient();
  const { data: admins } = await adminClient
    .from("venue_memberships")
    .select("profile_id")
    .eq("role", "admin")
    .eq("venue_id", venueId);
  if (!admins?.length) return [];

  const emails = await Promise.all(
    admins.map(async (a) => {
      const { data } = await adminClient.auth.admin.getUserById(a.profile_id);
      return data?.user?.email ?? null;
    })
  );
  return emails.filter((email): email is string => !!email);
}
