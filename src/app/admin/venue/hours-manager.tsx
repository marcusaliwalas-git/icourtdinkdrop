"use client";

import { useState, useTransition } from "react";
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
import { addOperatingHours, updateOperatingHours, deleteOperatingHours } from "./actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Hours = {
  id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  closes_next_day: boolean;
};

// A native <input type="time"> can't display "24:00" (the value the app stores for a close
// time of midnight — see lib/validation/venue.ts), so show it as 12:00 AM instead. The form
// action re-translates 00:00 back to 24:00 on save.
function closeTimeInputValue(closeTime: string): string {
  const hhmm = closeTime.slice(0, 5);
  return hhmm === "24:00" ? "00:00" : hhmm;
}

function HourRow({ hour }: { hour: Hours }) {
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateOperatingHours(hour.id, formData);
      if (result.error) setError(result.error);
    });
  }

  function onDelete() {
    startDeleteTransition(async () => {
      await deleteOperatingHours(hour.id);
    });
  }

  return (
    <TableRow>
      <TableCell colSpan={4} className="p-2">
        <form action={onSave} className="flex flex-wrap items-end gap-3">
          <Select name="dayOfWeek" defaultValue={String(hour.day_of_week)}>
            <SelectTrigger className="w-36">
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
          <Input
            name="openTime"
            type="time"
            defaultValue={hour.open_time.slice(0, 5)}
            required
            className="w-32"
          />
          <Input
            name="closeTime"
            type="time"
            defaultValue={closeTimeInputValue(hour.close_time)}
            required
            className="w-32"
          />
          <label className="flex items-center gap-1.5 pb-2 text-sm whitespace-nowrap">
            <input type="checkbox" name="closesNextDay" defaultChecked={hour.closes_next_day} />
            Closes next day
          </label>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isDeleting}
            onClick={onDelete}
          >
            Remove
          </Button>
          {error && <p className="w-full text-sm text-destructive">{error}</p>}
        </form>
      </TableCell>
    </TableRow>
  );
}

export function HoursManager({ venueId, hours }: { venueId: string; hours: Hours[] }) {
  const [isPending, startTransition] = useTransition();

  function onAdd(formData: FormData) {
    formData.set("venueId", venueId);
    startTransition(async () => {
      await addOperatingHours(formData);
    });
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        To allow bookings up until midnight, set Close to 12:00 AM. For a court open past midnight
        (e.g. 6:00 PM to 2:00 AM), set Close to 2:00 AM and tick <strong>Closes next day</strong> —
        the late slots stay on the opening day&rsquo;s calendar.
      </p>
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
            <HourRow key={h.id} hour={h} />
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
        <label className="flex items-center gap-1.5 pb-2 text-sm whitespace-nowrap">
          <input type="checkbox" name="closesNextDay" />
          Closes next day
        </label>
        <Button type="submit" disabled={isPending}>
          Add
        </Button>
      </form>
    </div>
  );
}
