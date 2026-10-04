"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addEquipment, updateEquipment, deleteEquipment } from "./actions";

export type Equipment = {
  id: string;
  name: string;
  hourly_rate_cents: number;
  stock: number;
  max_per_booking: number | null;
  is_active: boolean;
};

function EquipmentRow({ item }: { item: Equipment }) {
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateEquipment(item.id, formData);
      if (result.error) setError(result.error);
    });
  }

  return (
    <form action={onSave} className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 p-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Name</Label>
        <Input name="name" defaultValue={item.name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Hourly rate (₱)</Label>
        <Input name="hourlyRate" type="number" min={0} step={1} defaultValue={item.hourly_rate_cents / 100} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Stock (units owned)</Label>
        <Input name="stock" type="number" min={0} step={1} defaultValue={item.stock} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Max per booking (optional)</Label>
        <Input name="maxPerBooking" type="number" min={1} step={1} defaultValue={item.max_per_booking ?? ""} placeholder="No limit" />
      </div>
      <label className="flex items-center gap-2 self-end text-sm">
        <input type="checkbox" name="isActive" defaultChecked={item.is_active} className="size-4" />
        Available to rent
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isDeleting}
          onClick={() =>
            startDeleteTransition(async () => {
              const result = await deleteEquipment(item.id);
              if (result.error) setError(result.error);
            })
          }
        >
          Remove
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}

export function EquipmentManager({ venueId, equipment }: { venueId: string; equipment: Equipment[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onAdd(formData: FormData) {
    formData.set("venueId", venueId);
    setError(null);
    startTransition(async () => {
      const result = await addEquipment(formData);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Gear customers can rent by the hour alongside a court — paddles, ball buckets, ball machines. Stock
        is the number of units you own; the booking page won&rsquo;t let more than that be rented for the
        same time.
      </p>

      <div className="flex flex-col gap-3">
        {equipment.map((e) => (
          <EquipmentRow key={e.id} item={e} />
        ))}
        {equipment.length === 0 && <p className="text-sm text-muted-foreground">No equipment yet. Add some below.</p>}
      </div>

      <form action={onAdd} className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-border/60 p-3 sm:grid-cols-2">
        <p className="text-sm font-medium sm:col-span-2">Add equipment</p>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="eqName">Name</Label>
          <Input id="eqName" name="name" placeholder="e.g. Ball machine" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="eqRate">Hourly rate (₱)</Label>
          <Input id="eqRate" name="hourlyRate" type="number" min={0} step={1} placeholder="e.g. 200" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="eqStock">Stock (units owned)</Label>
          <Input id="eqStock" name="stock" type="number" min={0} step={1} placeholder="e.g. 2" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="eqMax">Max per booking (optional)</Label>
          <Input id="eqMax" name="maxPerBooking" type="number" min={1} step={1} placeholder="No limit" />
        </div>
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" name="isActive" defaultChecked className="size-4" />
          Available to rent
        </label>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add equipment"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </form>
    </div>
  );
}
