"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { upsertCoach, deleteCoach } from "./actions";

export type Coach = {
  id: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  hourly_rate_cents: number;
  is_active: boolean;
  sort_order: number;
};

const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
}

function CoachForm({ venueId, coach, onSaved }: { venueId: string; coach: Coach | null; onSaved: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>(coach?.photo_url ?? "");
  const [uploading, setUploading] = useState(false);

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setError("That image is too large — please use one under 5MB.");
      e.target.value = "";
      return;
    }
    // Catch unsupported formats before the upload — most often an iPhone HEIC photo, which the
    // bucket rejects and which browsers can't display anyway. Guide the admin to a web format.
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      setError(
        "That photo format isn't supported. Please use a JPG, PNG, or WebP. On iPhone, set Settings → Camera → Formats to “Most Compatible”, or export the photo as JPEG first.",
      );
      e.target.value = "";
      return;
    }
    setError(null);
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("coach-photos")
      .upload(path, file, { contentType: file.type });
    if (uploadError) {
      // Surface the real reason (bucket missing, RLS, mime, size…) instead of a generic message.
      console.error("coach photo upload failed:", uploadError);
      setError(`Couldn't upload the photo: ${uploadError.message}`);
      setUploading(false);
      e.target.value = "";
      return;
    }
    const { data } = supabase.storage.from("coach-photos").getPublicUrl(path);
    setPhotoUrl(data.publicUrl);
    setUploading(false);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    const rate = Number(formData.get("rate"));
    const input = {
      venueId,
      name: String(formData.get("name") ?? ""),
      bio: (formData.get("bio") as string) || undefined,
      photoUrl: photoUrl || undefined,
      hourlyRateCents: Number.isFinite(rate) ? Math.round(rate * 100) : 0,
      isActive: formData.get("isActive") === "on",
      sortOrder: Number(formData.get("sortOrder")) || 0,
    };
    startTransition(async () => {
      const result = await upsertCoach(coach?.id ?? null, input);
      if (result.error) setError(result.error);
      else onSaved();
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 overflow-hidden rounded-lg bg-muted">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="photo">Photo</Label>
          <Input id="photo" type="file" accept={ACCEPTED_PHOTO_TYPES.join(",")} onChange={onPhotoChange} />
          {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={coach?.name} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bio">Coach profile</Label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={coach?.bio ?? ""}
          rows={4}
          placeholder="Experience, specialties, playing level…"
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate">Rate per hour (₱)</Label>
          <Input
            id="rate"
            name="rate"
            type="number"
            min={0}
            step="0.01"
            defaultValue={coach ? (coach.hourly_rate_cents / 100).toFixed(2) : "0"}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sortOrder">Sort order</Label>
          <Input id="sortOrder" name="sortOrder" type="number" defaultValue={coach?.sort_order ?? 0} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={coach ? coach.is_active : true} />
        Show on the public coaches page
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending || uploading}>
        {isPending ? "Saving…" : coach ? "Save changes" : "Add coach"}
      </Button>
    </form>
  );
}

export function CoachesManager({ venueId, coaches }: { venueId: string; coaches: Coach[] }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Coach | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSaved() {
    setAddOpen(false);
    setEditing(null);
    router.refresh();
  }

  function onDelete(id: string) {
    startTransition(async () => {
      await deleteCoach(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Coaches</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Add coach</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90svh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add coach</DialogTitle>
            </DialogHeader>
            <CoachForm venueId={venueId} coach={null} onSaved={onSaved} />
          </DialogContent>
        </Dialog>
      </div>

      {coaches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No coaches yet. Add one to show it on the public page.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
          {coaches.map((c) => (
            <li key={c.id} className="flex items-center gap-3 p-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                {c.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photo_url} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="flex flex-1 flex-col">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {c.name}
                  {!c.is_active && <Badge className="bg-muted text-muted-foreground">Hidden</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">{pesos(c.hourly_rate_cents)}/hr</span>
              </div>
              <Dialog open={editing?.id === c.id} onOpenChange={(o) => setEditing(o ? c : null)}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    Edit
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90svh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit coach</DialogTitle>
                  </DialogHeader>
                  <CoachForm venueId={venueId} coach={c} onSaved={onSaved} />
                </DialogContent>
              </Dialog>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onDelete(c.id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
