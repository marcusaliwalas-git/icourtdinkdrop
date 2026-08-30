import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// A venue is a tenant. The deployment serves many tenants from one database and resolves which
// one from the request's hostname: a subdomain under the root domain (acme.dinkdrop.live → slug
// "acme"), or a completely separate custom domain (acmepickleball.com → venues.custom_domain).

const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "dinkdrop.live").toLowerCase();

/** The subdomain label for a host under the root domain, or null (bare root / www / not ours). */
function hostToSlug(host: string): string | null {
  if (host === ROOT_DOMAIN) return null;
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const label = host.slice(0, -(ROOT_DOMAIN.length + 1)).split(".")[0];
  return label && label !== "www" ? label : null;
}

/**
 * The venue (tenant) for the current request, resolved once per request. Order:
 *   1. exact custom-domain match (covers any full domain, including the existing prod domain);
 *   2. subdomain slug under the root domain;
 *   3. single-tenant / local fallback — if only one venue exists, serve it, so localhost and
 *      not-yet-configured single-tenant deployments keep working with zero config.
 * Returns null when a real host matches nothing and more than one tenant exists.
 */
export const getTenant = cache(async () => {
  const h = await headers();
  const host = (h.get("host") ?? "").split(":")[0].toLowerCase();
  const supabase = await createClient();

  const isLocal =
    host === "" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");

  // A deactivated venue must not resolve — its site goes offline until it's reactivated.
  if (!isLocal) {
    const { data: byDomain } = await supabase
      .from("venues")
      .select("*")
      .eq("custom_domain", host)
      .eq("is_active", true)
      .maybeSingle();
    if (byDomain) return byDomain;

    const slug = hostToSlug(host);
    if (slug) {
      const { data: bySlug } = await supabase
        .from("venues")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (bySlug) return bySlug;
    }
  }

  // Fallbacks (active venues only). A single active venue is unambiguous, so serve it regardless.
  const { data: venues } = await supabase
    .from("venues")
    .select("*")
    .eq("is_active", true)
    .order("created_at")
    .limit(2);
  if (venues && venues.length === 1) return venues[0];

  if (isLocal) {
    const devSlug = process.env.DEV_TENANT_SLUG;
    if (devSlug) {
      const { data: dev } = await supabase
        .from("venues")
        .select("*")
        .eq("slug", devSlug)
        .eq("is_active", true)
        .maybeSingle();
      if (dev) return dev;
    }
    if (venues && venues.length) return venues[0];
  }

  return null;
});
