"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setProfileName } from "@/app/account/actions";

/** Shown to a signed-in account that still has no name. It can't be dismissed — no close button, and
 * Esc / outside-click are blocked — so the person adds a name before continuing. Rendered only when
 * the server determines full_name is blank; on save it refreshes and the dialog drops away. */
export function RequireNameDialog() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setProfileName(trimmed);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>What&apos;s your name?</DialogTitle>
          <DialogDescription>
            Add your name so venues and coaches know who booked. You only need to do this once.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="require-name">Full name</Label>
            <Input
              id="require-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Juan Dela Cruz"
              autoFocus
              maxLength={120}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save name"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
