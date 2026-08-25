import { createClient } from "@/lib/supabase/server";
import { formatInTimezone } from "@/lib/time";
import { CoachesManager, type Coach } from "./coaches-manager";
import { RequestsList, type CoachRequest } from "./requests-list";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  preferred_at: string | null;
  message: string | null;
  status: string;
  coaches: { name: string } | null;
  profiles: { full_name: string | null; phone: string | null } | null;
};

export default async function AdminCoachesPage() {
  const supabase = await createClient();

  const { data: venue } = await supabase
    .from("venues")
    .select("id, timezone")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!venue) {
    return <p className="text-muted-foreground">Set up your venue first.</p>;
  }
  const tz = venue.timezone ?? "Asia/Manila";

  const [{ data: coaches }, { data: requests }] = await Promise.all([
    supabase
      .from("coaches")
      .select("id, name, bio, photo_url, hourly_rate_cents, is_active, sort_order")
      .eq("venue_id", venue.id)
      .order("sort_order")
      .order("name")
      .returns<Coach[]>(),
    supabase
      .from("coach_requests")
      .select(
        "id, guest_name, guest_phone, guest_email, preferred_at, message, status, coaches(name), profiles(full_name, phone)"
      )
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<RequestRow[]>(),
  ]);

  const requestItems: CoachRequest[] = (requests ?? []).map((r) => ({
    id: r.id,
    coachName: r.coaches?.name ?? "—",
    requester: (r.profiles?.full_name || r.guest_name || "Someone").trim() || "Someone",
    contact: r.profiles?.phone || r.guest_phone || r.guest_email || "—",
    preferredLabel: r.preferred_at
      ? formatInTimezone(new Date(r.preferred_at), "EEE d MMM, h:mm a", tz)
      : null,
    message: r.message,
    status: r.status,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Coaches</h1>
        <p className="text-sm text-muted-foreground">
          Manage the coaches shown on the public page, and review coaching requests.
        </p>
      </div>

      <section className="rounded-lg border border-border/60 p-4">
        <CoachesManager venueId={venue.id} coaches={coaches ?? []} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border/60 p-4">
        <h2 className="font-medium">Coaching requests</h2>
        <RequestsList requests={requestItems} />
      </section>
    </div>
  );
}
