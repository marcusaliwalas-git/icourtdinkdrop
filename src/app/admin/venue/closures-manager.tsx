"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addClosure, deleteClosure } from "./actions";
import { formatInTimezone } from "@/lib/time";

type Court = { id: string; name: string };
type Closure = {
  id: string;
  court_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  courts: { name: string } | null;
};

export function ClosuresManager({
  venueId,
  courts,
  closures,
}: {
  venueId: string;
  courts: Court[];
  closures: Closure[];
}) {
  const [isPending, startTransition] = useTransition();

  function onAdd(formData: FormData) {
    formData.set("venueId", venueId);
    if (formData.get("courtId") === "venue") {
      formData.set("courtId", "");
    }
    const startsAtLocal = formData.get("startsAt") as string;
    const endsAtLocal = formData.get("endsAt") as string;
    formData.set("startsAt", new Date(startsAtLocal).toISOString());
    formData.set("endsAt", new Date(endsAtLocal).toISOString());
    startTransition(async () => {
      await addClosure(formData);
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      await deleteClosure(id);
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Scope</TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {closures.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.courts?.name ?? "Whole venue"}</TableCell>
              <TableCell>{formatInTimezone(new Date(c.starts_at), "MMM d, HH:mm")}</TableCell>
              <TableCell>{formatInTimezone(new Date(c.ends_at), "MMM d, HH:mm")}</TableCell>
              <TableCell>{c.reason ?? "-"}</TableCell>
              <TableCell>
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onDelete(c.id)}>
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {closures.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No closures.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <form action={onAdd} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="courtId">Court</Label>
          <Select name="courtId" defaultValue="venue">
            <SelectTrigger id="courtId" className="w-44">
              <SelectValue placeholder="Whole venue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="venue">Whole venue</SelectItem>
              {courts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startsAt">From</Label>
          <Input id="startsAt" name="startsAt" type="datetime-local" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endsAt">To</Label>
          <Input id="endsAt" name="endsAt" type="datetime-local" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reason">Reason</Label>
          <Input id="reason" name="reason" placeholder="Maintenance" />
        </div>
        <Button type="submit" disabled={isPending}>
          Add closure
        </Button>
      </form>
    </div>
  );
}
