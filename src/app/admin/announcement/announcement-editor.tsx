"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadVenueMedia } from "@/app/admin/homepage/media-upload";
import { updateAnnouncement } from "./actions";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export function AnnouncementEditor({
  announcement,
}: {
  announcement: {
    enabled: boolean;
    type: "text" | "image";
    text: string | null;
    imageUrl: string | null;
    link: string | null;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(announcement.enabled);
  const [type, setType] = useState<"text" | "image">(announcement.type);
  const [imageUrl, setImageUrl] = useState(announcement.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);
    setUploading(true);
    const result = await uploadVenueMedia(file);
    setUploading(false);
    if ("error" in result) return setMessage(result.error);
    if (result.type !== "image") return setMessage("Choose an image file for the banner.");
    setImageUrl(result.url);
  }

  function onSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateAnnouncement({
        enabled,
        type,
        text: String(formData.get("text") ?? ""),
        imageUrl: type === "image" ? imageUrl : "",
        link: String(formData.get("link") ?? ""),
      });
      setMessage(result.error ?? "Saved");
      if (!result.error) router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4" />
        Show the announcement banner on my site
      </label>

      <div className="flex flex-col gap-2">
        <Label>Banner content</Label>
        <div className="flex gap-2">
          {(["text", "image"] as const).map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              variant={type === t ? "default" : "outline"}
              onClick={() => setType(t)}
            >
              {t === "text" ? "Text" : "Image"}
            </Button>
          ))}
        </div>
      </div>

      {type === "text" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="text">Message</Label>
          <Input
            id="text"
            name="text"
            defaultValue={announcement.text ?? ""}
            maxLength={280}
            placeholder="🎉 Summer doubles tournament — Aug 24. Sign up at the front desk!"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>Banner image</Label>
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="max-h-40 w-full rounded-lg object-cover" />
          )}
          <div className="flex items-center gap-2">
            <Input type="file" accept={IMAGE_ACCEPT} onChange={onImage} className="w-auto" />
            {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
            {imageUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setImageUrl("")}>
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">A poster-style image works best — it&rsquo;s shown centered as a pop-up.</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="link">Link (optional)</Label>
        <Input id="link" name="link" defaultValue={announcement.link ?? ""} placeholder="/book or https://…" />
        <p className="text-xs text-muted-foreground">Where the banner sends visitors when tapped. Leave blank for no link.</p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending || uploading} className="w-fit">
          {isPending ? "Saving…" : "Save announcement"}
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </form>
  );
}
