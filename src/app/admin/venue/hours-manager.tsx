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
import { addOperatingHours, deleteOperatingHours } from "./actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Hours = {
  id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
};

export function HoursManager({ venueId, hours }: { venueId: string; hours: Hours[] }) {
  const [isPending, startTransition] = useTransition();

  function onAdd(formData: FormData) {
    formData.set("venueId", venueId);
    startTransition(async () => {
      await addOperatingHours(formData);
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      await deleteOperatingHours(id);
    });
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Day</TableHead>
            <TableHead>Open</TableHead>
            <TableHead>Close</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {hours.map((h) => (
            <TableRow key={h.id}>
              <TableCell>{DAYS[h.day_of_week]}</TableCell>
              <TableCell>{h.open_time.slice(0, 5)}</TableCell>
              <TableCell>{h.close_time.slice(0, 5)}</TableCell>
              <TableCell>
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onDelete(h.id)}>
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {hours.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No hours set — the court grid will show nothing bookable until you add some.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <form action={onAdd} className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dayOfWeek">Day</Label>
          <Select name="dayOfWeek" defaultValue="1">
            <SelectTrigger id="dayOfWeek" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS.map((day, i) => (
                <SelectItem key={i} value={String(i)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="openTime">Open</Label>
          <Input id="openTime" name="openTime" type="time" defaultValue="06:00" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="closeTime">Close</Label>
          <Input id="closeTime" name="closeTime" type="time" defaultValue="22:00" required />
        </div>
        <Button type="submit" disabled={isPending}>
          Add
        </Button>
      </form>
    </div>
  );
}
