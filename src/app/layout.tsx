import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk, Poppins, Sora, Rubik, Fraunces, Montserrat } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteAnnouncement } from "@/components/site-announcement";
import { Toaster } from "@/components/ui/sonner";
import { getTenant } from "@/lib/tenant";
import { isVenueAdmin } from "@/lib/auth";
import { featureEnabled } from "@/lib/features";
import { normalizeTheme, LIGHT_THEME } from "@/lib/themes";
import { normalizeFont } from "@/lib/fonts";

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

// Optional per-tenant faces — the super admin picks one per venue (see lib/fonts.ts). All are
// loaded so globals.css can switch to the chosen one by `data-font`, but preload:false means the
// browser only downloads the font a tenant actually renders in, not all four.
const poppins = Poppins({ variable: "--font-opt-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const sora = Sora({ variable: "--font-opt-sora", subsets: ["latin"], preload: false });
const rubik = Rubik({ variable: "--font-opt-rubik", subsets: ["latin"], preload: false });
const fraunces = Fraunces({ variable: "--font-opt-fraunces", subsets: ["latin"], preload: false });
const montserrat = Montserrat({ variable: "--font-opt-montserrat", subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });

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
  const theme = normalizeTheme(tenant?.theme);
  const font = normalizeFont(tenant?.font);
  // The app is dark-first; the one light theme drops the `dark` class so every component renders its
  // light base (and `dark:` utility variants stay off), while `data-theme` re-skins the tokens.
  const isLight = theme === LIGHT_THEME;
  return (
    <html
      lang="en"
      data-theme={theme}
      data-font={font}
      className={`${isLight ? "" : "dark"} ${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${poppins.variable} ${sora.variable} ${rubik.variable} ${fraunces.variable} ${montserrat.variable} h-full antialiased`}
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
