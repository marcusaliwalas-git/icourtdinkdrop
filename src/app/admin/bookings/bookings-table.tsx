"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInTimezone } from "@/lib/time";
import { parseTstzRange } from "@/lib/availability";
import { BookingActionSheet } from "../calendar/booking-action-sheet";

interface Booking {
  id: string;
  status: string;
  party_size: number;
  total_cents: number;
  payment_status: string;
  source: string;
  guest_name: string | null;
  guest_phone: string | null;
  time_range: string;
  reference_code: string;
  courts: { name: string } | null;
  profiles: { full_name: string | null; phone: string | null } | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "default",
  pending: "outline",
  cancelled: "secondary",
  completed: "secondary",
  no_show: "destructive",
};

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export function BookingsTable({ bookings, timezone }: { bookings: Booking[]; timezone: string }) {
  const [selected, setSelected] = useState<{
    id: string;
    label: string;
    startsAtIso: string;
    status: string;
  } | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Booked by</TableHead>
              <TableHead>Court</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((b) => {
              const { start, end } = parseTstzRange(b.time_range);
              const name = b.profiles?.full_name ?? b.guest_name ?? "Guest";
              return (
                <TableRow
                  key={b.id}
                  className="cursor-pointer"
                  onClick={() =>
                    setSelected({
                      id: b.id,
                      label: name,
                      startsAtIso: start.toISOString(),
                      status: b.status,
                    })
                  }
                >
                  <TableCell className="font-mono text-xs tracking-wide">{b.reference_code}</TableCell>
                  <TableCell>
                    {name}
                    <span className="ml-1.5 text-xs text-muted-foreground capitalize">({b.source})</span>
                  </TableCell>
                  <TableCell>{b.courts?.name ?? "-"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatInTimezone(start, "MMM d, h:mm a", timezone)}
                    {" – "}
                    {formatInTimezone(end, "h:mm a", timezone)}
                  </TableCell>
                  <TableCell>{b.party_size}</TableCell>
                  <TableCell>{pesos(b.total_cents)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{b.payment_status}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[b.status] ?? "secondary"}>{b.status}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {bookings.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No bookings match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <BookingActionSheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        bookingId={selected?.id ?? ""}
        label={selected?.label ?? ""}
        startsAtIso={selected?.startsAtIso ?? ""}
        status={selected?.status ?? "confirmed"}
      />
    </>
  );
}
