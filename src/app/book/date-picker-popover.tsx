"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";

// react-day-picker gives back a Date at local midnight of the clicked day. Reading it via
// toISOString() converts to UTC first, which rolls back to the previous day in any timezone
// ahead of UTC (e.g. the venue's Asia/Manila) — read the Date's own local Y/M/D instead.
function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DatePickerPopover({ date, venueId }: { date: string; venueId?: string }) {
  const router = useRouter();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <CalendarIcon className="size-4" />
          Pick a date
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={new Date(`${date}T12:00:00`)}
          onSelect={(selected) => {
            if (!selected) return;
            const d = toDateKey(selected);
            const qs = new URLSearchParams({ date: d });
            if (venueId) qs.set("venue", venueId);
            router.push(`/book?${qs.toString()}`);
          }}
          disabled={{ before: new Date() }}
        />
      </PopoverContent>
    </Popover>
  );
}
