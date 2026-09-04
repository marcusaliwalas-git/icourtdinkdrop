import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteAnnouncement } from "@/components/site-announcement";
import { Toaster } from "@/components/ui/sonner";
import { getTenant } from "@/lib/tenant";
import { isVenueAdmin } from "@/lib/auth";
import { featureEnabled } from "@/lib/features";
import { normalizeTheme } from "@/lib/themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for the home page's headlines only — everywhere else keeps Geist.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

// Per-tenant browser title/description: resolve the venue for the current host so each tenant's
// tab shows their own name. getTenant() is request-cached, so this doesn't double-query.
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  const name = tenant?.name ?? "iCourt Social";
  return {
    title: `${name} — Book a Pickleball Court`,
    description: `See what's open and book a court at ${name} in under a minute.`,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [tenant, isAdmin] = await Promise.all([getTenant(), isVenueAdmin()]);
  return (
    <html
      lang="en"
      data-theme={normalizeTheme(tenant?.theme)}
      className={`dark ${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteAnnouncement
          enabled={tenant?.announcement_enabled}
          type={tenant?.announcement_type}
          text={tenant?.announcement_text}
          imageUrl={tenant?.announcement_image_url}
          link={tenant?.announcement_link}
        />
        <SiteHeader
          logoUrl={tenant?.logo_url}
          brandName={tenant?.name}
          isAdmin={isAdmin}
          coachesEnabled={featureEnabled(tenant?.features, "coaches")}
        />
        <div className="flex-1">{children}</div>
        <SiteFooter
          brandName={tenant?.name}
          about={tenant?.footer_about}
          email={tenant?.footer_email}
          phone={tenant?.footer_phone}
          address={tenant?.footer_address}
          socials={tenant?.footer_socials}
          links={tenant?.footer_links}
        />
        <Toaster />
      </body>
    </html>
  );
}
