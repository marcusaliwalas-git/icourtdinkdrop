"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { requestCoach } from "./actions";

export function RequestCoachDialog({
  coachId,
  coachName,
  isLoggedIn,
}: {
  coachId: string;
  coachName: string;
  isLoggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(formData: FormData) {
    setError(null);
    const input = {
      coachId,
      guestName: isLoggedIn ? undefined : String(formData.get("guestName") ?? "") || undefined,
      guestPhone: isLoggedIn ? undefined : String(formData.get("guestPhone") ?? "") || undefined,
      guestEmail: isLoggedIn ? undefined : String(formData.get("guestEmail") ?? "") || undefined,
      preferredAtLocal: String(formData.get("preferredAt") ?? "") || undefined,
      message: String(formData.get("message") ?? "") || undefined,
    };
    startTransition(async () => {
      const result = await requestCoach(input);
      if (!result.success) setError(result.message);
      else setDone(true);
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setDone(false);
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Request coaching</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request {coachName}</DialogTitle>
        </DialogHeader>
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              Thanks! We&apos;ve sent your request to the venue — they&apos;ll be in touch to confirm a time.
            </p>
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <form action={onSubmit} className="flex flex-col gap-4">
            {!isLoggedIn && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="guestName">Your name</Label>
                  <Input id="guestName" name="guestName" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="guestPhone">Mobile number</Label>
                  <Input id="guestPhone" name="guestPhone" placeholder="09171234567" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="guestEmail">Email (optional)</Label>
                  <Input id="guestEmail" name="guestEmail" type="email" placeholder="you@example.com" />
                </div>
              </>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preferredAt">Preferred date &amp; time (optional)</Label>
              <Input id="preferredAt" name="preferredAt" type="datetime-local" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="message">Anything else? (optional)</Label>
              <Input id="message" name="message" placeholder="Skill level, goals, group size…" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={isPending}>
              {isPending ? "Sending…" : "Send request"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
