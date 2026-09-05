import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { RequestCoachDialog } from "./request-coach-dialog";
import { getTenant } from "@/lib/tenant";
import { featureEnabled } from "@/lib/features";

export const dynamic = "force-dynamic";

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
}

type Coach = {
  id: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  email: string | null;
  phone: string | null;
  hourly_rate_cents: number;
};

export default async function CoachesPage() {
  const supabase = await createClient();

  const venue = await getTenant();
  if (!featureEnabled(venue?.features, "coaches")) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: coaches } = venue
    ? await supabase
        .from("coaches")
        .select("id, name, bio, photo_url, email, phone, hourly_rate_cents")
        .eq("venue_id", venue.id)
        .eq("is_active", true)
        .order("sort_order")
        .order("name")
        .returns<Coach[]>()
    : { data: [] as Coach[] };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">Coaches</h1>
        <p className="text-sm text-muted-foreground">
          Book a session with one of our coaches, or add coaching to any court booking.
        </p>
      </div>

      {!coaches || coaches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          No coaches listed yet. Check back soon.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {coaches.map((c) => (
            <li key={c.id} className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card">
              <div className="aspect-[4/3] w-full bg-muted">
                {c.photo_url ? (
                  // Public bucket URL from an external host — a plain img avoids next/image config.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photo_url} alt={c.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-muted-foreground">
                    {c.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-semibold">{c.name}</h2>
                  <span className="text-sm font-medium text-primary">{pesos(c.hourly_rate_cents)}/hr</span>
                </div>
                {c.bio && <p className="flex-1 text-sm text-muted-foreground">{c.bio}</p>}
                {(c.email || c.phone) && (
                  <div className="flex flex-col gap-0.5 text-sm">
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="text-muted-foreground hover:text-foreground">
                        {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="text-muted-foreground hover:text-foreground break-all">
                        {c.email}
                      </a>
                    )}
                  </div>
                )}
                <div className="pt-1">
                  <RequestCoachDialog coachId={c.id} coachName={c.name} isLoggedIn={!!user} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Want a court too?{" "}
        <Link href="/book" className="underline underline-offset-2">
          Book a court
        </Link>{" "}
        and add a coach at checkout.
      </p>
    </div>
  );
}
