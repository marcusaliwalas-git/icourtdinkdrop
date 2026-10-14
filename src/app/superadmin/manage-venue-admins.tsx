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
import { addVenueAdmin, removeVenueAdmin } from "./actions";

export interface VenueAdmin {
  id: string;
  email: string | null;
  name: string | null;
}

/** Super-admin control to see and manage a venue's admins: the current list with a Remove on each,
 * plus a form to add one (promotes an existing account, or creates one when a password is given). */
export function ManageVenueAdmins({
  venueId,
  venueName,
  admins,
}: {
  venueId: string;
  venueName: string;
  admins: VenueAdmin[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  function onAdd() {
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

  function onRemove(a: VenueAdmin) {
    setMessage(null);
    setRemovingId(a.id);
    startTransition(async () => {
      const result = await removeVenueAdmin(venueId, a.id);
      setRemovingId(null);
      if (result.error) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setMessage({ ok: true, text: `${a.email ?? "That admin"} was removed.` });
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
          Admins ({admins.length})
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Admins — {venueName}</DialogTitle>
          <DialogDescription>Who can manage this venue. Add or remove admins below.</DialogDescription>
        </DialogHeader>

        {/* Current admins */}
        <div className="flex flex-col gap-2 py-1">
          {admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admins yet — add the first one below.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60 rounded-md border">
              {admins.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{a.email ?? "—"}</span>
                    {a.name && <span className="block truncate text-xs text-muted-foreground">{a.name}</span>}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-destructive hover:text-destructive"
                    disabled={isPending}
                    onClick={() => onRemove(a)}
                  >
                    {removingId === a.id ? "Removing…" : "Remove"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add an admin */}
        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="text-sm font-medium">Add an admin</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adminEmail">Email</Label>
            <Input
              id="adminEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@venue.com"
            />
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
            <p className="text-xs text-muted-foreground">
              If the email already has an account they&rsquo;re promoted to admin; otherwise set a password to create one.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adminName">Name (optional, new account)</Label>
            <Input id="adminName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Cruz" />
          </div>
        </div>

        {message && <p className={message.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{message.text}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Close
          </Button>
          <Button onClick={onAdd} disabled={isPending || !email}>
            {isPending && removingId === null ? "Adding…" : "Add admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
