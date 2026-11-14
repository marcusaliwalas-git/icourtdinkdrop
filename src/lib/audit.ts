import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

/**
 * Append an audit-log entry attributed to the current signed-in user. Best-effort — a failed audit
 * write never breaks the action it records. The actor is auth.uid() (the staff/admin performing the
 * action), so admin-area mutations show the real person, not "guest/system".
 *
 * venue_id is set from the current tenant so the entry shows on that venue's audit page. The
 * audit_log_fill_venue trigger only derives venue for a few entity types (and needs a live row), so
 * we set it explicitly here — covering new entities and actions whose row is already deleted.
 */
export async function auditCurrent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: string,
  entity: string,
  entityId: string | null,
  after: unknown
): Promise<void> {
  try {
    const [{ data: { user } }, tenant] = await Promise.all([supabase.auth.getUser(), getTenant()]);
    await supabase.from("audit_log").insert({
      actor_id: user?.id ?? null,
      venue_id: tenant?.id ?? null,
      action,
      entity,
      entity_id: entityId,
      after: after ?? null,
    });
  } catch (err) {
    console.error(`auditCurrent(${action}) failed:`, err);
  }
}
