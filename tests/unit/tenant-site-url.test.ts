import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tenantSiteUrl, tenantEmailBrand } from "@/lib/site-url";

// tenantSiteUrl builds a tenant's own public base URL for email links: custom domain first, then
// a `<slug>.<root>` subdomain, then the single-tenant fallback.
describe("tenantSiteUrl", () => {
  const prevRoot = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const prevSite = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "dinkdrop.live";
    process.env.NEXT_PUBLIC_SITE_URL = "https://fallback.example";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = prevRoot;
    process.env.NEXT_PUBLIC_SITE_URL = prevSite;
  });

  it("prefers a custom domain", () => {
    expect(tenantSiteUrl({ slug: "acme", custom_domain: "acmepickleball.com" })).toBe("https://acmepickleball.com");
  });

  it("uses <slug>.<root domain> when there's no custom domain", () => {
    expect(tenantSiteUrl({ slug: "acme", custom_domain: null })).toBe("https://acme.dinkdrop.live");
  });

  it("falls back for the not-yet-configured default tenant", () => {
    expect(tenantSiteUrl({ slug: "default", custom_domain: null })).toBe("https://fallback.example");
    expect(tenantSiteUrl(null)).toBe("https://fallback.example");
  });
});

describe("tenantEmailBrand", () => {
  it("uses the venue name as the sender brand and its own from-address when set", () => {
    const brand = tenantEmailBrand({
      name: "Acme Pickleball",
      slug: "acme",
      custom_domain: null,
      email_from: "hello@acmepickleball.com",
    });
    expect(brand.brandName).toBe("Acme Pickleball");
    expect(brand.fromEmail).toBe("hello@acmepickleball.com");
  });

  it("defaults the from-address to null (shared platform address) and names an unnamed venue", () => {
    const brand = tenantEmailBrand({ name: null, slug: "acme", custom_domain: null });
    expect(brand.brandName).toBe("Bookings");
    expect(brand.fromEmail).toBeNull();
  });
});
