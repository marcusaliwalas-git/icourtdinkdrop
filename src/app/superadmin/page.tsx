import { createClient } from "@/lib/supabase/server";
import { formatInTimezone } from "@/lib/time";
import { CreateTenantForm } from "./create-tenant-form";
import { DeleteVenueButton } from "./delete-venue-button";
import { VenueActiveToggle } from "./venue-active-toggle";
import { VenueCapabilities } from "./venue-capabilities";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const supabase = await createClient();
  const { data: venues } = await supabase
    .from("venues")
    .select("id, name, slug, custom_domain, timezone, created_at, is_active, features")
    .order("created_at", { ascending: false });

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "dinkdrop.live";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Tenants</p>
        <h1 className="mt-1 text-2xl font-bold">Venues on this deployment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {(venues ?? []).length} venue{(venues ?? []).length === 1 ? "" : "s"} — all served from one deployment and
          one database, isolated by venue.
        </p>
      </div>

      <section className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase">
              <th className="p-3 font-medium">Venue</th>
              <th className="p-3 font-medium">Reachable at</th>
              <th className="p-3 font-medium">Timezone</th>
              <th className="p-3 font-medium">Created</th>
              <th className="p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(venues ?? []).map((v) => (
              <tr key={v.id} className={`border-b border-border/40 last:border-0 ${v.is_active ? "" : "opacity-60"}`}>
                <td className="p-3 font-medium">
                  {v.name}
                  {!v.is_active && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-normal tracking-wide text-muted-foreground uppercase">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    <span>
                      {v.slug}.{rootDomain}
                    </span>
                    {v.custom_domain && <span className="text-primary">{v.custom_domain}</span>}
                  </div>
                </td>
                <td className="p-3 text-muted-foreground">{v.timezone}</td>
                <td className="p-3 text-muted-foreground">
                  {formatInTimezone(new Date(v.created_at), "MMM d, yyyy", v.timezone)}
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <VenueCapabilities venueId={v.id} features={v.features} />
                    <VenueActiveToggle venueId={v.id} active={v.is_active} />
                    <DeleteVenueButton venueId={v.id} venueName={v.name} />
                  </div>
                </td>
              </tr>
            ))}
            {(venues ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                  No venues yet. Onboard the first one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border/60 p-4">
        <div>
          <h2 className="text-lg font-semibold">Onboard a new tenant</h2>
          <p className="text-sm text-muted-foreground">
            Creates the venue, a full week of 6 AM–10 PM hours, a starter court, and the venue&rsquo;s first admin.
          </p>
        </div>
        <CreateTenantForm rootDomain={rootDomain} />
      </section>
    </div>
  );
}
