import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { AnnouncementEditor } from "./announcement-editor";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementPage() {
  const venue = await getTenant();

  if (!venue) {
    return <p className="text-muted-foreground">Set up your venue first.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Announcement</h1>
          <p className="text-sm text-muted-foreground">
            A pop-up shown in the center of your site when visitors arrive — for upcoming events, promos, or notices.
            Choose a short message or an image.
          </p>
        </div>
        <Link href="/" target="_blank" className="text-sm text-primary hover:underline">
          View site ↗
        </Link>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border/60 p-4">
        <AnnouncementEditor
          announcement={{
            enabled: venue.announcement_enabled,
            type: venue.announcement_type === "image" ? "image" : "text",
            text: venue.announcement_text,
            imageUrl: venue.announcement_image_url,
            link: venue.announcement_link,
          }}
        />
      </section>
    </div>
  );
}
