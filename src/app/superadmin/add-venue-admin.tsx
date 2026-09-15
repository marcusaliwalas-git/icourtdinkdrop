"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { addVenueAdmin } from "./actions";

/** Super-admin control to add an admin to an existing venue — promotes an existing account, or
 * creates a new one when a password is given. */
export function AddVenueAdmin({ venueId, venueName }: { venueId: string; venueName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  function onSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await addVenueAdmin(venueId, { email, password, fullName });
      if (result.error) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setMessage({ ok: true, text: `${email} is now an admin of ${venueName}.` });
      setEmail("");
      setPassword("");
      setFullName("");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setMessage(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Add admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add admin — {venueName}</DialogTitle>
          <DialogDescription>
            Enter the person&rsquo;s email. If they already have an account they&rsquo;re promoted to admin; otherwise set a
            password to create a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adminEmail">Email</Label>
            <Input id="adminEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@venue.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adminPassword">Password (only for a new account)</Label>
            <Input
              id="adminPassword"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <p className="text-xs text-muted-foreground">Leave blank if the email already has an account.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adminName">Name (optional, new account)</Label>
            <Input id="adminName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Cruz" />
          </div>

          {message && <p className={message.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{message.text}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Close
          </Button>
          <Button onClick={onSave} disabled={isPending || !email}>
            {isPending ? "Adding…" : "Add admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
