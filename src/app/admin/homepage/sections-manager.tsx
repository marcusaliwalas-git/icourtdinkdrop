"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { upsertSection, deleteSection } from "./actions";
import { uploadVenueMedia } from "./media-upload";
import { HERO_SIZES } from "@/lib/home-defaults";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";

export type Section = {
  id: string;
  title: string | null;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  media_size: string | null;
  sort_order: number;
  is_visible: boolean;
};

function SectionForm({ venueId, section, onSaved }: { venueId: string; section: Section | null; onSaved: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState(section?.media_url ?? "");
  const [mediaType, setMediaType] = useState(section?.media_type ?? "");
  const [mediaSize, setMediaSize] = useState(section?.media_size ?? "medium");
  const [uploading, setUploading] = useState(false);

  async function onMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    const result = await uploadVenueMedia(file);
    setUploading(false);
    if ("error" in result) return setError(result.error);
    setMediaUrl(result.url);
    setMediaType(result.type);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await upsertSection(section?.id ?? null, {
        venueId,
        title: String(formData.get("title") ?? ""),
        body: String(formData.get("body") ?? ""),
        mediaUrl,
        mediaType: mediaUrl ? mediaType : "",
        mediaSize,
        sortOrder: Number(formData.get("sortOrder")) || 0,
        isVisible: formData.get("isVisible") === "on",
      });
      if (result.error) setError(result.error);
      else onSaved();
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Heading</Label>
        <Input id="title" name="title" defaultValue={section?.title ?? ""} placeholder="e.g. Our facilities" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="body">Text</Label>
        <textarea
          id="body"
          name="body"
          defaultValue={section?.body ?? ""}
          rows={4}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Image or video (optional)</Label>
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
            <Label htmlFor="sectionSize" className="text-sm">
              Size
            </Label>
            <select
              id="sectionSize"
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
      <div className="grid grid-cols-2 items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sortOrder">Order</Label>
          <Input id="sortOrder" name="sortOrder" type="number" defaultValue={section?.sort_order ?? 0} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="isVisible" defaultChecked={section ? section.is_visible : true} />
          Show on the home page
        </label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isPending || uploading}>
        {isPending ? "Saving…" : section ? "Save section" : "Add section"}
      </Button>
    </form>
  );
}

export function SectionsManager({ venueId, sections }: { venueId: string; sections: Section[] }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSaved() {
    setAddOpen(false);
    setEditing(null);
    router.refresh();
  }

  function onDelete(id: string) {
    startTransition(async () => {
      await deleteSection(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Content sections</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Add section</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90svh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add section</DialogTitle>
            </DialogHeader>
            <SectionForm venueId={venueId} section={null} onSaved={onSaved} />
          </DialogContent>
        </Dialog>
      </div>

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sections yet. Add one to show extra info, photos, or a video on your home page.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
          {sections.map((s) => (
            <li key={s.id} className="flex items-center gap-3 p-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                {s.media_url ? (
                  s.media_type === "video" ? (
                    <video src={s.media_url} className="h-full w-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.media_url} alt="" className="h-full w-full object-cover" />
                  )
                ) : null}
              </div>
              <div className="flex flex-1 flex-col">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {s.title || "(untitled section)"}
                  {!s.is_visible && <Badge className="bg-muted text-muted-foreground">Hidden</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">Order {s.sort_order}</span>
              </div>
              <Dialog open={editing?.id === s.id} onOpenChange={(o) => setEditing(o ? s : null)}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">Edit</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90svh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit section</DialogTitle>
                  </DialogHeader>
                  <SectionForm venueId={venueId} section={s} onSaved={onSaved} />
                </DialogContent>
              </Dialog>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onDelete(s.id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
