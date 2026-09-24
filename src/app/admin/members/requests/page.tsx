import { requireAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { featureEnabled } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { formatInTimezone } from "@/lib/time";
import { SubscriptionRequests, type RequestRow } from "./requests-client";

export const dynamic = "force-dynamic";

export default async function SubscriptionRequestsPage() {
  await requireAdmin();
  const venue = await getTenant();
  if (!venue) return <p className="text-muted-foreground">Set up your venue first.</p>;
  if (!featureEnabled(venue.features, "official_members")) {
    return <p className="text-muted-foreground">Official members isn&apos;t enabled for this venue.</p>;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("membership_requests")
    .select(
      "id, tier, amount_cents, duration_days, payment_reference, status, created_at, reviewed_at, review_notes, profiles!membership_requests_profile_id_fkey(full_name, email)"
    )
    .eq("venue_id", venue.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows: RequestRow[] = (data ?? []).map((r) => {
    const p = r.profiles as unknown as { full_name: string | null; email: string | null } | null;
    return {
      id: r.id,
      name: p?.full_name ?? p?.email ?? "Member",
      email: p?.email ?? null,
      tier: r.tier,
      amountCents: r.amount_cents,
      durationDays: r.duration_days,
      reference: r.payment_reference,
      status: r.status,
      submitted: formatInTimezone(new Date(r.created_at), "MMM d, h:mm a", venue.timezone),
      reviewNotes: r.review_notes,
    };
  });

  const pending = rows.filter((r) => r.status === "pending");
  const reviewed = rows.filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">People</p>
        <h1 className="mt-1 text-2xl font-bold">Subscription Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review membership payments. Approving grants (or extends) the member&apos;s official membership.
        </p>
      </div>

      <SubscriptionRequests pending={pending} reviewed={reviewed} />
    </div>
  );
}
