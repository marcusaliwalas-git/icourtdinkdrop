"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { upsertCourt } from "./actions";

type Court = {
  id: string;
  name: string;
  surface: string | null;
  is_indoor: boolean;
  hourly_rate_cents: number;
  member_rate_cents: number | null;
  is_active: boolean;
};

function centsToPesos(cents: number) {
  return (cents / 100).toFixed(2);
}

function CourtForm({
  venueId,
  court,
  onSaved,
}: {
  venueId: string;
  court: Court | null;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    formData.set("venueId", venueId);
    startTransition(async () => {
      const result = await upsertCourt(court?.id ?? null, formData);
      if (result.error) {
        setError(result.error);
      } else {
        onSaved();
      }
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Court name</Label>
        <Input id="name" name="name" defaultValue={court?.name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="surface">Surface</Label>
        <Input id="surface" name="surface" defaultValue={court?.surface ?? ""} placeholder="Cushioned acrylic" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hourlyRate">Hourly rate (PHP)</Label>
          <Input
            id="hourlyRate"
            name="hourlyRate"
            type="number"
            step="0.01"
            min={0}
            defaultValue={court ? centsToPesos(court.hourly_rate_cents) : undefined}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="memberRate">Member rate (PHP, optional)</Label>
          <Input
            id="memberRate"
            name="memberRate"
            type="number"
            step="0.01"
            min={0}
            defaultValue={
              court?.member_rate_cents != null ? centsToPesos(court.member_rate_cents) : undefined
            }
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isIndoor" defaultChecked={court?.is_indoor} />
        Indoor court
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={court?.is_active ?? true} />
        Active (bookable)
      </label>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save court"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

export function CourtsManager({ venueId, courts }: { venueId: string; courts: Court[] }) {
  const [openId, setOpenId] = useState<string | "new" | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={openId === "new"} onOpenChange={(o) => setOpenId(o ? "new" : null)}>
          <DialogTrigger asChild>
            <Button size="sm">Add court</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add court</DialogTitle>
            </DialogHeader>
            <CourtForm venueId={venueId} court={null} onSaved={() => setOpenId(null)} />
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Court</TableHead>
            <TableHead>Surface</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {courts.map((court) => (
            <TableRow key={court.id}>
              <TableCell>{court.name}{court.is_indoor ? " (indoor)" : ""}</TableCell>
              <TableCell>{court.surface ?? "-"}</TableCell>
              <TableCell>
                ₱{centsToPesos(court.hourly_rate_cents)}/hr
                {court.member_rate_cents != null && (
                  <span className="text-muted-foreground"> (₱{centsToPesos(court.member_rate_cents)} member)</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={court.is_active ? "default" : "secondary"}>
                  {court.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <Dialog open={openId === court.id} onOpenChange={(o) => setOpenId(o ? court.id : null)}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">Edit</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit court</DialogTitle>
                    </DialogHeader>
                    <CourtForm venueId={venueId} court={court} onSaved={() => setOpenId(null)} />
                  </DialogContent>
                </Dialog>
              </TableCell>
            </TableRow>
          ))}
          {courts.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No courts yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
