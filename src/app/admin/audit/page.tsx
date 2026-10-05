import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { formatInTimezone } from "@/lib/time";
import { requireAdmin } from "@/lib/auth";
import { describeAuditEntry } from "@/lib/audit-describe";
import { AuditTable, type AuditRow } from "./audit-table";

export const dynamic = "force-dynamic";

// Filter chips: value is the stored audit entity, label is what's shown.
const ENTITIES: { value: string; label: string }[] = [
  { value: "booking", label: "Booking" },
  { value: "venue", label: "Venue" },
  { value: "court", label: "Court" },
  { value: "operating_hours", label: "Hours" },
  { value: "payment_account", label: "Payment account" },
  { value: "rate_period", label: "Rate period" },
  { value: "closure", label: "Closure" },
  { value: "membership_plan", label: "Membership plan" },
  { value: "promotion", label: "Promotion" },
  { value: "membership_request", label: "Subscription" },
  { value: "profile", label: "Member" },
];

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  await requireAdmin();
  const { entity } = await searchParams;
  const supabase = await createClient();
  const venue = await getTenant();

  let query = supabase
    .from("audit_log")
    .select("id, action, entity, entity_id, before, after, created_at, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  // Scope to this venue — RLS alone would show a multi-venue admin their other venues' history.
  if (venue) query = query.eq("venue_id", venue.id);
  if (entity) query = query.eq("entity", entity);

  const { data: entries } = await query;
  const rowsRaw = entries ?? [];

  // Booking rows show the customer-facing reference code (e.g. 5D16C3C0) instead of the internal
  // UUID. entity_id is polymorphic (no FK to embed), so resolve the codes in one lookup.
  const bookingIds = Array.from(
    new Set(
      rowsRaw.filter((e) => e.entity === "booking" && e.entity_id).map((e) => e.entity_id as string)
    )
  );
  const refByBookingId = new Map<string, string>();
  if (bookingIds.length) {
    const { data: bookingRefs } = await supabase
      .from("bookings")
      .select("id, reference_code")
      .in("id", bookingIds);
    for (const b of bookingRefs ?? []) refByBookingId.set(b.id, b.reference_code);
  }

  // Subscription rows name the member they're for — the profile_id lives in the `after` payload, not
  // entity_id (which is the request id). Resolve those names in one lookup too.
  const memberIds = Array.from(
    new Set(
      rowsRaw
        .filter((e) => e.entity === "membership_request")
        .map((e) => (e.after as { profile_id?: string } | null)?.profile_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const nameByProfileId = new Map<string, string>();
  if (memberIds.length) {
    const { data: members } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", memberIds);
    for (const m of members ?? []) if (m.full_name) nameByProfileId.set(m.id, m.full_name);
  }

  const rows: AuditRow[] = rowsRaw.map((entry) => {
    const actor =
      (entry.profiles as unknown as { full_name: string | null } | null)?.full_name ??
      "guest / system";
    const bookingRef =
      entry.entity === "booking" && entry.entity_id
        ? refByBookingId.get(entry.entity_id) ?? entry.entity_id.slice(0, 8)
        : undefined;
    const memberName =
      entry.entity === "membership_request"
        ? nameByProfileId.get((entry.after as { profile_id?: string } | null)?.profile_id ?? "")
        : undefined;

    const summary = describeAuditEntry(entry, { bookingRef, memberName });
    const when = formatInTimezone(new Date(entry.created_at), "MMM d, h:mm:ss a");

    return {
      id: entry.id,
      when,
      actor,
      summary,
      action: entry.action,
      // Everything someone might type into the search box.
      search: `${actor} ${summary} ${entry.action} ${bookingRef ?? ""}`.toLowerCase(),
    };
  });

  function hrefFor(e: string | null) {
    return e ? `/admin/audit?entity=${e}` : "/admin/audit";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <div className="flex flex-wrap gap-2">
          <a
            href={hrefFor(null)}
            className={`rounded-full border px-3 py-1 text-xs ${!entity ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            All
          </a>
          {ENTITIES.map((e) => (
            <a
              key={e.value}
              href={hrefFor(e.value)}
              className={`rounded-full border px-3 py-1 text-xs ${entity === e.value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {e.label}
            </a>
          ))}
        </div>
      </div>

      <AuditTable rows={rows} />
    </div>
  );
}
