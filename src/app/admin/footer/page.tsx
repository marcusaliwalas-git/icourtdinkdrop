import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { parseSocials, parseLinks } from "@/lib/footer";
import { FooterEditor } from "./footer-editor";

export const dynamic = "force-dynamic";

export default async function AdminFooterPage() {
  const venue = await getTenant();

  if (!venue) {
    return <p className="text-muted-foreground">Set up your venue first.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Footer</h1>
          <p className="text-sm text-muted-foreground">
            The footer shown at the bottom of every public page — contact details, social links, and anything else.
          </p>
        </div>
        <Link href="/" target="_blank" className="text-sm text-primary hover:underline">
          View site ↗
        </Link>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border/60 p-4">
        <FooterEditor
          footer={{
            about: venue.footer_about,
            email: venue.footer_email,
            phone: venue.footer_phone,
            address: venue.footer_address,
            socials: parseSocials(venue.footer_socials),
            links: parseLinks(venue.footer_links),
          }}
        />
      </section>
    </div>
  );
}
