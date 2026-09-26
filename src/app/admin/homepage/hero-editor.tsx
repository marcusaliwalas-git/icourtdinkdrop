"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateHero } from "./actions";
import { HERO_SIZES } from "@/lib/home-defaults";
import { uploadVenueMedia } from "./media-upload";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";

export function HeroEditor({
  hero,
}: {
  hero: {
    heading: string | null;
    subheading: string | null;
    mediaUrl: string | null;
    mediaType: string | null;
    mediaSize: string | null;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState(hero.mediaUrl ?? "");
  const [mediaType, setMediaType] = useState(hero.mediaType ?? "");
  const [mediaSize, setMediaSize] = useState(hero.mediaSize ?? "medium");
  const [uploading, setUploading] = useState(false);

  async function onMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);
    setUploading(true);
    const result = await uploadVenueMedia(file);
    setUploading(false);
    if ("error" in result) return setMessage(result.error);
    setMediaUrl(result.url);
    setMediaType(result.type);
  }

  function onSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateHero({
        heroHeading: String(formData.get("heading") ?? ""),
        heroSubheading: String(formData.get("subheading") ?? ""),
        heroMediaUrl: mediaUrl,
        heroMediaType: mediaUrl ? mediaType : "",
        heroMediaSize: mediaSize,
      });
      setMessage(result.error ?? "Saved");
      if (!result.error) router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="heading">Headline</Label>
        <Input id="heading" name="heading" defaultValue={hero.heading ?? ""} placeholder="See what's open. Book it. Play tonight." />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subheading">Sub-headline</Label>
        <Input
          id="subheading"
          name="subheading"
          defaultValue={hero.subheading ?? ""}
          placeholder="Real-time court availability, no account needed…"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Hero image or video (optional)</Label>
        {mediaUrl &&
          (mediaType === "video" ? (
            <video src={mediaUrl} className="max-h-40 w-full rounded-lg object-cover" muted controls />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="max-h-40 w-full rounded-lg object-cover" />
          ))}
        <div className="flex items-center gap-2">
          <Input type="file" accept={ACCEPT} onChange={onMedia} className="w-auto" />
          {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
          {mediaUrl && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setMediaUrl(""); setMediaType(""); }}>
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Videos should be H.264 <code>.mp4</code> for every browser. Phone clips are often HEVC/H.265,
          which plays on iPhone and Safari but shows a black box in Chrome and Firefox — re-export as H.264 first.
        </p>
        {mediaUrl && (
          <div className="flex items-center gap-2">
            <Label htmlFor="heroSize" className="text-sm">
              Size
            </Label>
            <select
              id="heroSize"
              value={mediaSize}
              onChange={(e) => setMediaSize(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {HERO_SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">How big it appears on your site.</span>
          </div>
        )}
      </div>
      <Button type="submit" disabled={isPending || uploading} className="w-fit">
        {isPending ? "Saving…" : "Save hero"}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </form>
  );
}
