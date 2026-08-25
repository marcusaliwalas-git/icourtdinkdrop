"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

// Jump straight to any date, alongside the Prev/Today/Next steppers. The calendar is a server
// component keyed off the `date` search param, so picking a date just navigates there; local
// state gives instant feedback and re-syncs whenever the server sends a new date back.
export function CalendarDatePicker({ date }: { date: string }) {
  const router = useRouter();
  const [value, setValue] = useState(date);

  useEffect(() => {
    setValue(date);
  }, [date]);

  return (
    <Input
      type="date"
      value={value}
      aria-label="Jump to date"
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        if (next) router.push(`/admin/calendar?date=${next}`);
      }}
      className="w-auto py-1.5 text-sm"
    />
  );
}
