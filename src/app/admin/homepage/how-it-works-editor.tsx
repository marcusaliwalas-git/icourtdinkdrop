"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateHowItWorks } from "./actions";

export function HowItWorksEditor({
  steps,
  note,
  defaultSteps,
  defaultNote,
}: {
  steps: string[] | null;
  note: string | null;
  defaultSteps: string[];
  defaultNote: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const stepLines = String(formData.get("steps") ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await updateHowItWorks({
        steps: stepLines,
        note: String(formData.get("note") ?? ""),
      });
      setMessage(result.error ?? "Saved");
      if (!result.error) router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="steps">Steps</Label>
        <textarea
          id="steps"
          name="steps"
          defaultValue={(steps ?? []).join("\n")}
          rows={5}
          placeholder={defaultSteps.join("\n")}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">One step per line, shown left to right with arrows between. Up to 6.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" name="note" defaultValue={note ?? ""} placeholder={defaultNote} />
      </div>
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Saving…" : "Save how it works"}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </form>
  );
}
