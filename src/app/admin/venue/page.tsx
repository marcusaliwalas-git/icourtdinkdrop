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

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{venue.name}</h1>
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
          <CourtsManager venueId={venue.id} courts={courts ?? []} />
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
