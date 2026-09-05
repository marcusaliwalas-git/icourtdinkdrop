import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { DEFAULT_HOW_NOTE, DEFAULT_HOW_STEPS } from "@/lib/home-defaults";
import { HeroEditor } from "./hero-editor";
import { HowItWorksEditor } from "./how-it-works-editor";
import { SectionsManager, type Section } from "./sections-manager";

export const dynamic = "force-dynamic";

export default async function AdminHomepagePage() {
  const supabase = await createClient();
  const venue = await getTenant();

  if (!venue) {
    return <p className="text-muted-foreground">Set up your venue first.</p>;
  }

  const { data: sections } = await supabase
    .from("venue_sections")
    .select("id, title, body, media_url, media_type, media_size, sort_order, is_visible")
    .eq("venue_id", venue.id)
    .order("sort_order")
    .returns<Section[]>();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Home page</h1>
          <p className="text-sm text-muted-foreground">
            Customize what visitors see on your site&rsquo;s main page — headline, visuals, and your own sections.
          </p>
        </div>
        <Link href="/" target="_blank" className="text-sm text-primary hover:underline">
          View home ↗
        </Link>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border/60 p-4">
        <h2 className="font-medium">Hero</h2>
        <HeroEditor
          hero={{
            heading: venue.hero_heading,
            subheading: venue.hero_subheading,
            mediaUrl: venue.hero_media_url,
            mediaType: venue.hero_media_type,
            mediaSize: venue.hero_media_size,
          }}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border/60 p-4">
        <h2 className="font-medium">How it works</h2>
        <HowItWorksEditor
          steps={venue.how_steps}
          note={venue.how_note}
          noteHidden={venue.how_note_hidden}
          defaultSteps={DEFAULT_HOW_STEPS}
          defaultNote={DEFAULT_HOW_NOTE}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border/60 p-4">
        <SectionsManager venueId={venue.id} sections={sections ?? []} />
      </section>
    </div>
  );
}
