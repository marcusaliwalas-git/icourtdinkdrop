"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addEquipment, updateEquipment, deleteEquipment } from "./actions";

export type Equipment = {
  id: string;
  name: string;
  hourly_rate_cents: number;
  member_hourly_rate_cents: number | null;
  stock: number;
  max_per_booking: number | null;
  is_active: boolean;
};

function pesos(cents: number) {
  return `₱${(cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

/** Add or edit one equipment item in a popup. `item` undefined = add mode. */
function EquipmentDialog({
  venueId,
  item,
  trigger,
}: {
  venueId: string;
  item?: Equipment;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    if (!item) formData.set("venueId", venueId);
    setError(null);
    startTransition(async () => {
      const result = item ? await updateEquipment(item.id, formData) : await addEquipment(formData);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  function onDelete() {
    if (!item) return;
    setError(null);
    startDeleteTransition(async () => {
      const result = await deleteEquipment(item.id);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.name}` : "Add equipment"}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="eqName">Name</Label>
            <Input id="eqName" name="name" defaultValue={item?.name} placeholder="e.g. Ball machine" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eqRate">Hourly rate (₱)</Label>
            <Input
              id="eqRate"
              name="hourlyRate"
              type="number"
              min={0}
              step={1}
              defaultValue={item ? item.hourly_rate_cents / 100 : ""}
              placeholder="e.g. 200"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eqMemberRate">Member rate (₱, optional)</Label>
            <Input
              id="eqMemberRate"
              name="memberRate"
              type="number"
              min={0}
              step={1}
              defaultValue={item?.member_hourly_rate_cents != null ? item.member_hourly_rate_cents / 100 : ""}
              placeholder="Same as standard"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eqStock">Stock (units owned)</Label>
            <Input id="eqStock" name="stock" type="number" min={0} step={1} defaultValue={item?.stock ?? ""} placeholder="e.g. 2" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eqMax">Max per booking (optional)</Label>
            <Input
              id="eqMax"
              name="maxPerBooking"
              type="number"
              min={1}
              step={1}
              defaultValue={item?.max_per_booking ?? ""}
              placeholder="No limit"
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked={item?.is_active ?? true} className="size-4" />
            Available to rent
          </label>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <DialogFooter className="sm:col-span-2">
            {item && (
              <Button type="button" variant="ghost" className="mr-auto text-destructive" disabled={isDeleting} onClick={onDelete}>
                {isDeleting ? "Removing…" : "Remove"}
              </Button>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : item ? "Save changes" : "Add equipment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EquipmentManager({ venueId, equipment }: { venueId: string; equipment: Equipment[] }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Gear customers can rent by the hour alongside a court — paddles, ball buckets, ball machines. Stock
          is the number of units you own; the booking page won&rsquo;t let more than that be rented for the same
          time.
        </p>
        <EquipmentDialog venueId={venueId} trigger={<Button size="sm">Add equipment</Button>} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Member</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="text-right">Max</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-0"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {equipment.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-medium">{e.name}</TableCell>
              <TableCell className="text-right">{pesos(e.hourly_rate_cents)}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {e.member_hourly_rate_cents != null ? pesos(e.member_hourly_rate_cents) : "—"}
              </TableCell>
              <TableCell className="text-right">{e.stock}</TableCell>
              <TableCell className="text-right text-muted-foreground">{e.max_per_booking ?? "—"}</TableCell>
              <TableCell>
                {e.is_active ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Inactive
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <EquipmentDialog
                  venueId={venueId}
                  item={e}
                  trigger={
                    <Button size="sm" variant="outline">
                      Edit
                    </Button>
                  }
                />
              </TableCell>
            </TableRow>
          ))}
          {equipment.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No equipment yet. Add some to rent them out by the hour.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
