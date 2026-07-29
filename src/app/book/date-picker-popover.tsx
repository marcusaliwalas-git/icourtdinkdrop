"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";

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
            const d = selected.toISOString().slice(0, 10);
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
