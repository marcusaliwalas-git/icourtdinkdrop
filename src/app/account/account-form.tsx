"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile, signOut } from "./actions";

export function AccountForm({
  fullName,
  phone,
  skillLevel,
}: {
  fullName: string;
  phone: string;
  skillLevel?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateProfile(formData);
      setMessage(result.error ?? "Saved");
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" defaultValue={fullName} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Mobile number</Label>
        <Input id="phone" name="phone" defaultValue={phone} placeholder="09171234567" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="skillLevel">Skill level (2.5-5.0)</Label>
        <Input
          id="skillLevel"
          name="skillLevel"
          type="number"
          step="0.5"
          min="2.5"
          max="5.0"
          defaultValue={skillLevel}
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save changes"}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <Button
        type="button"
        variant="outline"
        onClick={() => signOut().then(() => (window.location.href = "/"))}
      >
        Sign out
      </Button>
    </form>
  );
}
