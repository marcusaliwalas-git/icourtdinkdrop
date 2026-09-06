"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addRatePeriod, deleteRatePeriod } from "./actions";

function centsToPesos(cents: number) {
  return (cents / 100).toFixed(2);
}

// Show stored 24-hour times ("14:00", or "24:00" for midnight-as-end-of-day) as 12-hour AM/PM, so
// the table matches the AM/PM time pickers used to enter them.
function to12Hour(value: string): string {
  const [hStr, mStr] = value.slice(0, 5).split(":");
  const h = Number(hStr) % 24; // 24:00 (end of day) → 0 → 12:00 AM
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${period}`;
}

type RatePeriod = {
  id: string;
  start_time: string;
  end_time: string;
  hourly_rate_cents: number;
  member_rate_cents: number | null;
};

export function RatePeriodsManager({
  courtId,
  ratePeriods,
}: {
  courtId: string;
  ratePeriods: RatePeriod[];
}) {
  const [isPending, startTransition] = useTransition();

  function onAdd(formData: FormData) {
    formData.set("courtId", courtId);
    startTransition(async () => {
      await addRatePeriod(formData);
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      await deleteRatePeriod(id);
    });
  }

  const sorted = [...ratePeriods].sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label className="text-sm font-medium">Time-based rates</Label>
        <p className="text-xs text-muted-foreground">
          Override the rate above for specific hours, e.g. 7:00 AM–2:00 PM at one rate and 2:00 PM
          onwards at another. Hours with no override use the rate above. For a period that ends at
          midnight, set the end to 12:00 AM.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{to12Hour(p.start_time)}</TableCell>
              <TableCell>{to12Hour(p.end_time)}</TableCell>
              <TableCell>
                ₱{centsToPesos(p.hourly_rate_cents)}/hr
                {p.member_rate_cents != null && (
                  <span className="text-muted-foreground"> (₱{centsToPesos(p.member_rate_cents)} member)</span>
                )}
              </TableCell>
              <TableCell>
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onDelete(p.id)}>
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No time-based rates — this court charges the flat rate above all day.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <form action={onAdd} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`start-${courtId}`}>From</Label>
          <Input id={`start-${courtId}`} name="startTime" type="time" defaultValue="07:00" required className="w-28" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`end-${courtId}`}>To</Label>
          <Input id={`end-${courtId}`} name="endTime" type="time" defaultValue="14:00" required className="w-28" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`rate-${courtId}`}>Rate (PHP)</Label>
          <Input id={`rate-${courtId}`} name="hourlyRate" type="number" step="0.01" min={0} required className="w-28" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`member-rate-${courtId}`}>Member (PHP, optional)</Label>
          <Input id={`member-rate-${courtId}`} name="memberRate" type="number" step="0.01" min={0} className="w-32" />
        </div>
        <Button type="submit" size="sm" disabled={isPending}>
          Add
        </Button>
      </form>
    </div>
  );
}
