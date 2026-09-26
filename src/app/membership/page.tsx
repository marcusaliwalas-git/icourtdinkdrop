import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { featureEnabled } from "@/lib/features";
import { formatInTimezone } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MembershipPurchase } from "./membership-client";

export const dynamic = "force-dynamic";

export default async function MembershipPage() {
  const supabase = await createClient();
  const venue = await getTenant();

  if (!venue || !featureEnabled(venue.features, "official_members")) {
    return <p className="mx-auto max-w-lg p-6 text-muted-foreground">Membership isn&apos;t available at this venue.</p>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: planRows } = await supabase
    .from("membership_plans")
    .select("id, name, price_cents, duration_days")
    .eq("venue_id", venue.id)
    .eq("is_active", true)
    .order("sort_order");
  const plans = (planRows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    priceCents: p.price_cents,
    durationDays: p.duration_days,
  }));
  const configured = plans.length > 0;

  const today = formatInTimezone(new Date(), "yyyy-MM-dd", venue.timezone);

  // The signed-in member's current standing (tier + expiry) + any request awaiting review.
  let activeTier: string | null = null;
  let activeUntil: string | null = null;
  let pending = false;
  if (user) {
    const [{ data: membership }, { data: request }] = await Promise.all([
      supabase
        .from("memberships")
        .select("tier, ends_on")
        .eq("profile_id", user.id)
        .eq("venue_id", venue.id)
        .eq("status", "active")
        .or(`ends_on.is.null,ends_on.gte.${today}`)
        .order("ends_on", { ascending: false, nullsFirst: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("membership_requests")
        .select("id")
        .eq("profile_id", user.id)
        .eq("venue_id", venue.id)
        .eq("status", "pending")
        .maybeSingle(),
    ]);
    activeTier = membership ? membership.tier : null;
    activeUntil = membership ? membership.ends_on : null;
    pending = !!request;
  }

  const { data: accounts } = await supabase
    .from("payment_accounts")
    .select("bank_name, account_name, account_number, remarks, qr_url")
    .eq("venue_id", venue.id)
    .order("sort_order");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Membership</h1>
        <p className="text-sm text-muted-foreground">Become an official member of {venue.name}.</p>
      </div>

      {/* Current standing — which tier they're on and until when */}
      {user && activeTier && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          <span className="text-muted-foreground">Current plan:</span>
          <Badge className="capitalize bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
            {activeTier}
          </Badge>
          {activeUntil && (
            <span className="text-muted-foreground">
              Active until {formatInTimezone(new Date(`${activeUntil}T12:00:00Z`), "MMMM d, yyyy", venue.timezone)}
            </span>
          )}
        </div>
      )}

      {!user ? (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <p>Sign in to buy or manage your membership.</p>
          <Button asChild className="mt-3" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      ) : !configured ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Membership isn&apos;t set up yet — please check back later.
        </p>
      ) : pending ? (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <Badge variant="outline">Request submitted</Badge>
          <p className="mt-2 text-muted-foreground">
            Your payment is being reviewed. You&apos;ll get your membership once an admin confirms the receipt.
          </p>
        </div>
      ) : (
        <>
          {activeTier && (
            <p className="text-sm text-muted-foreground">
              Renewing extends your membership from its current end date — you won&apos;t lose any days. To change tiers,
              contact the venue.
            </p>
          )}
          <MembershipPurchase plans={plans} accounts={accounts ?? []} lockedTier={activeTier} />
        </>
      )}
    </div>
  );
}
