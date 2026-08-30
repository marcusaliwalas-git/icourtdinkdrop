import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VenueDetailsForm } from "./venue-details-form";
import { CourtsManager } from "./courts-manager";
import { HoursManager } from "./hours-manager";
import { ClosuresManager } from "./closures-manager";
import { PaymentAccountsManager } from "./payment-accounts-manager";
import { getTenant } from "@/lib/tenant";

export default async function AdminVenuePage() {
  const supabase = await createClient();

  const venue = await getTenant();

  if (!venue) {
    // The host didn't resolve to a venue. If this admin already belongs to one, they're just on
    // the wrong address — point them to their venue's own host instead of the (misleading)
    // "create your venue" form, which is only for an admin who genuinely has no venue yet.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = user
      ? await supabase.from("profiles").select("venue_id").eq("id", user.id).single()
      : { data: null };

    if (profile?.venue_id) {
      const { data: myVenue } = await supabase
        .from("venues")
        .select("name, slug, custom_domain")
        .eq("id", profile.venue_id)
        .single();
      if (myVenue) {
        const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "dinkdrop.live";
        const host = myVenue.custom_domain || `${myVenue.slug}.${rootDomain}`;
        return (
          <div className="flex max-w-lg flex-col gap-3">
            <h1 className="text-xl font-semibold">You&rsquo;re on a different address</h1>
            <p className="text-sm text-muted-foreground">
              Your venue <strong>{myVenue.name}</strong> is managed at its own address — this URL doesn&rsquo;t map to
              it, so there&rsquo;s nothing to show here.
            </p>
            <a
              href={`https://${host}/admin/venue`}
              className="w-fit rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03]"
            >
              Go to {host} →
            </a>
            <p className="text-xs text-muted-foreground">
              If that address isn&rsquo;t loading yet, its DNS or custom domain may still be propagating.
            </p>
          </div>
        );
      }
    }

    return (
      <div className="max-w-lg">
        <h1 className="mb-4 text-xl font-semibold">Create your venue</h1>
        <VenueDetailsForm venue={null} />
      </div>
    );
  }

  const [{ data: courts }, { data: hours }, { data: closures }, { data: paymentAccounts }] = await Promise.all([
    supabase.from("courts").select("*").eq("venue_id", venue.id).order("name"),
    supabase
      .from("operating_hours")
      .select("*")
      .eq("venue_id", venue.id)
      .order("day_of_week"),
    supabase
      .from("closures")
      .select("*, courts(name)")
      .eq("venue_id", venue.id)
      .order("starts_at", { ascending: false }),
    supabase
      .from("payment_accounts")
      .select("id, bank_name, account_name, account_number, remarks, sort_order")
      .eq("venue_id", venue.id)
      .order("sort_order"),
  ]);

  const courtIds = (courts ?? []).map((c) => c.id);
  const { data: ratePeriods } = courtIds.length
    ? await supabase.from("court_rate_periods").select("*").in("court_id", courtIds)
    : { data: [] as { id: string; court_id: string; start_time: string; end_time: string; hourly_rate_cents: number; member_rate_cents: number | null }[] };

  const ratePeriodsByCourtId: Record<string, NonNullable<typeof ratePeriods>> = {};
  for (const period of ratePeriods ?? []) {
    (ratePeriodsByCourtId[period.court_id] ??= []).push(period);
  }

  return (
    <div>
      <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Venue &amp; courts</p>
      <h1 className="mt-1 mb-6 text-2xl font-bold">{venue.name}</h1>
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="courts">Courts</TabsTrigger>
          <TabsTrigger value="hours">Hours</TabsTrigger>
          <TabsTrigger value="payment">Payment</TabsTrigger>
          <TabsTrigger value="closures">Closures</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="max-w-lg">
          <VenueDetailsForm venue={venue} />
        </TabsContent>
        <TabsContent value="courts">
          <CourtsManager
            venueId={venue.id}
            courts={courts ?? []}
            ratePeriodsByCourtId={ratePeriodsByCourtId}
          />
        </TabsContent>
        <TabsContent value="hours">
          <HoursManager venueId={venue.id} hours={hours ?? []} />
        </TabsContent>
        <TabsContent value="payment">
          <PaymentAccountsManager venueId={venue.id} accounts={paymentAccounts ?? []} />
        </TabsContent>
        <TabsContent value="closures">
          <ClosuresManager
            venueId={venue.id}
            courts={courts ?? []}
            closures={closures ?? []}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
