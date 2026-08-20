"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SESSION_FORMATS, SESSION_FORMAT_LABELS, type SessionFormat } from "@/lib/validation/session";
import { upsertSession } from "./actions";

export type CourtOption = { id: string; name: string };
export type HostOption = { id: string; name: string };

export type SessionDraft = {
  id: string;
  title: string;
  description: string | null;
  format: SessionFormat;
  startsAtLocal: string;
  endsAtLocal: string;
  capacity: number;
  priceCents: number;
  courtIds: string[];
  hostId: string | null;
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function SessionForm({
  venueId,
  courts,
  hosts,
  session,
  onSaved,
}: {
  venueId: string;
  courts: CourtOption[];
  hosts: HostOption[];
  session?: SessionDraft;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<SessionFormat>(session?.format ?? "challenge_court");
  const [courtIds, setCourtIds] = useState<string[]>(session?.courtIds ?? []);

  function toggleCourt(id: string) {
    setCourtIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function onSubmit(formData: FormData) {
    setError(null);
    const priceInput = Number(formData.get("price"));
    const input = {
      venueId,
      title: String(formData.get("title") ?? ""),
      description: (formData.get("description") as string) || undefined,
      format,
      startsAtLocal: String(formData.get("startsAt") ?? ""),
      endsAtLocal: String(formData.get("endsAt") ?? ""),
      capacity: Number(formData.get("capacity")),
      priceCents: Number.isFinite(priceInput) ? Math.round(priceInput * 100) : 0,
      courtIds,
      hostId: (formData.get("hostId") as string) || null,
    };
    startTransition(async () => {
      const result = await upsertSession(session?.id ?? null, input);
      if (result.error) setError(result.error);
      else onSaved();
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={session?.title} placeholder="Tuesday Open Play" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" defaultValue={session?.description ?? ""} placeholder="Optional" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="format">Format</Label>
          <select
            id="format"
            className={selectClass}
            value={format}
            onChange={(e) => setFormat(e.target.value as SessionFormat)}
          >
            {SESSION_FORMATS.map((f) => (
              <option key={f} value={f}>
                {SESSION_FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hostId">Host</Label>
          <select id="hostId" name="hostId" className={selectClass} defaultValue={session?.hostId ?? ""}>
            <option value="">— Unassigned —</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startsAt">Starts</Label>
          <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={session?.startsAtLocal} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endsAt">Ends</Label>
          <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={session?.endsAtLocal} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="capacity">Capacity</Label>
          <Input id="capacity" name="capacity" type="number" min={1} max={200} defaultValue={session?.capacity ?? 16} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">Price per player (₱)</Label>
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            step="0.01"
            defaultValue={session ? (session.priceCents / 100).toFixed(2) : "0"}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Courts in rotation</Label>
        {courts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a court to this venue first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {courts.map((c) => {
              const active = courtIds.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => toggleCourt(c.id)}
                  aria-pressed={active}
                  className={
                    "rounded-full border px-3 py-1 text-sm transition-colors " +
                    (active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-input text-muted-foreground hover:text-foreground")
                  }
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending || courts.length === 0}>
        {isPending ? "Saving…" : session ? "Save changes" : "Create session"}
      </Button>
    </form>
  );
}
