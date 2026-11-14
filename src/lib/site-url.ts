/**
 * Absolute base URL of the deployed site, for building links in emails and other
 * server-side contexts where `window.location.origin` isn't available.
 *
 * Prefers an explicit NEXT_PUBLIC_SITE_URL (set this to the real custom domain in
 * production, e.g. https://icourt.dinkdrop.live). Falls back to Vercel's per-deployment
 * URL, then to localhost for local dev. Never returns a trailing slash.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * The public base URL for a specific tenant (venue), for links inside its emails — so a booking
 * confirmation points at that tenant's own host, not a single shared one. Prefers the venue's
 * custom domain, then its `‹slug›.‹root domain›` subdomain, falling back to getSiteUrl() for a
 * not-yet-configured single-tenant deployment (slug still "default").
 */
export function tenantSiteUrl(venue: { slug: string | null; custom_domain: string | null } | null): string {
  if (venue?.custom_domain) return `https://${venue.custom_domain.replace(/\/+$/, "")}`;
  if (venue?.slug && venue.slug !== "default") {
    const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "dinkdrop.live").toLowerCase();
    return `https://${venue.slug}.${root}`;
  }
  return getSiteUrl();
}

/** Per-tenant email branding: the sender display name (the venue's own name), its optional custom
 * sending address (else the shared platform address is used), and its base URL for links. */
export interface EmailBrand {
  siteUrl: string;
  brandName: string;
  fromEmail: string | null;
  /** Absolute URL of the tenant's logo for the email header, or null. A stored relative path
   * (e.g. the default venue's /icourt-social-logo.png) is resolved against the tenant's site URL. */
  logoUrl: string | null;
}

export function tenantEmailBrand(
  venue: {
    name?: string | null;
    slug: string | null;
    custom_domain: string | null;
    email_from?: string | null;
    logo_url?: string | null;
  } | null
): EmailBrand {
  const siteUrl = tenantSiteUrl(venue);
  const rawLogo = venue?.logo_url ?? null;
  return {
    siteUrl,
    brandName: venue?.name?.trim() || "Bookings",
    fromEmail: venue?.email_from ?? null,
    logoUrl: rawLogo ? (rawLogo.startsWith("http") ? rawLogo : `${siteUrl}${rawLogo}`) : null,
  };
}
