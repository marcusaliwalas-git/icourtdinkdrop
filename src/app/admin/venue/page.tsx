import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VenueDetailsForm } from "./venue-details-form";
import { CourtsManager } from "./courts-manager";
import { HoursManager } from "./hours-manager";
import { ClosuresManager } from "./closures-manager";

export default async function AdminVenuePage() {
  const supabase = await createClient();

  const { data: venue } = await supabase
    .from("venues")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!venue) {
    return (
      <div className="max-w-lg">
        <h1 className="mb-4 text-xl font-semibold">Create your venue</h1>
        <VenueDetailsForm venue={null} />
      </div>
    );
  }

  const [{ data: courts }, { data: hours }, { data: closures }] = await Promise.all([
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
