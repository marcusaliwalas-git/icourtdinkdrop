"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatInTimezone } from "@/lib/time";
import { parseTstzRange } from "@/lib/availability";
import { bookingPaymentLabel } from "@/lib/payment-methods";
import { BookingActionSheet } from "../calendar/booking-action-sheet";

interface Booking {
  id: string;
  status: string;
  party_size: number;
  total_cents: number;
  payment_status: string;
  payment_method: string | null;
  source: string;
  guest_name: string | null;
  guest_phone: string | null;
  time_range: string;
  reference_code: string;
  booking_group_id: string | null;
  created_at: string;
  courts: { name: string } | null;
  profiles: { full_name: string | null; phone: string | null; email: string | null } | null;
}

/** A stable hue per cart, so the same cart's rows share one colour even when the sort scatters them. */
function cartHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "default",
  pending: "outline",
  cancelled: "secondary",
  completed: "secondary",
  no_show: "destructive",
  voided: "secondary",
};

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

function nameOf(b: Booking): string {
  return b.profiles?.full_name ?? b.profiles?.email ?? b.guest_name ?? "Guest";
}

type SortKey = "reference" | "bookedBy" | "court" | "when" | "total" | "payment" | "status" | "submitted";

export function BookingsTable({ bookings, timezone }: { bookings: Booking[]; timezone: string }) {
  const [selected, setSelected] = useState<{
    id: string;
    label: string;
    startsAtIso: string;
    status: string;
  } | null>(null);
  // Default to soonest-first (matches the server's time_range order).
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "when", dir: "asc" });

  // Members of each cart, in list order — to show "n of m" and a shared accent on grouped rows.
  const cartMembers = new Map<string, string[]>();
  for (const b of bookings) {
    if (!b.booking_group_id) continue;
    const arr = cartMembers.get(b.booking_group_id) ?? [];
    arr.push(b.id);
    cartMembers.set(b.booking_group_id, arr);
  }
  function cartInfo(b: Booking) {
    if (!b.booking_group_id) return null;
    const arr = cartMembers.get(b.booking_group_id);
    if (!arr || arr.length < 2) return null; // a lone booking isn't a "cart"
    return {
      pos: arr.indexOf(b.id) + 1,
      total: arr.length,
      code: b.booking_group_id.slice(0, 4).toUpperCase(),
      hue: cartHue(b.booking_group_id),
    };
  }

  const rows = useMemo(() => {
    const decorated = bookings.map((b) => {
      const { start, end } = parseTstzRange(b.time_range);
      return { b, start, end, name: nameOf(b) };
    });
    const val = (r: (typeof decorated)[number]): string | number => {
      switch (sort.key) {
        case "reference":
          return r.b.reference_code.toLowerCase();
        case "bookedBy":
          return r.name.toLowerCase();
        case "court":
          return (r.b.courts?.name ?? "").toLowerCase();
        case "when":
          return r.start.getTime();
        case "total":
          return r.b.total_cents;
        case "payment":
          return bookingPaymentLabel(r.b.payment_method, r.b.payment_status).toLowerCase();
        case "status":
          return r.b.status;
        case "submitted":
          return new Date(r.b.created_at).getTime();
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return decorated.sort((a, z) => {
      const va = val(a);
      const vz = val(z);
      if (va < vz) return -1 * dir;
      if (va > vz) return 1 * dir;
      return 0;
    });
  }, [bookings, sort]);

  function SortHeader({ label, k, className }: { label: string; k: SortKey; className?: string }) {
    const active = sort.key === k;
    return (
      <TableHead className={className}>
        <button
          type="button"
          className="flex items-center gap-1 hover:text-foreground"
          onClick={() => setSort((s) => ({ key: k, dir: s.key === k && s.dir === "asc" ? "desc" : "asc" }))}
        >
          {label}
          <span className={cn("text-[0.65rem]", active ? "opacity-100" : "opacity-30")}>
            {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </TableHead>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader label="Reference" k="reference" />
              <SortHeader label="Booked by" k="bookedBy" />
              <SortHeader label="Court" k="court" />
              <SortHeader label="When" k="when" />
              <SortHeader label="Total" k="total" />
              <SortHeader label="Payment" k="payment" />
              <SortHeader label="Status" k="status" />
              <SortHeader label="Submitted" k="submitted" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ b, start, end, name }) => {
              const cart = cartInfo(b);
              const pendingPayment = b.payment_status === "pay_at_venue";
              return (
                <TableRow
                  key={b.id}
                  className={cn("cursor-pointer", pendingPayment && "bg-destructive/10 hover:bg-destructive/15")}
                  style={cart ? { boxShadow: `inset 3px 0 0 hsl(${cart.hue} 70% 55%)` } : undefined}
                  onClick={() =>
                    setSelected({ id: b.id, label: name, startsAtIso: start.toISOString(), status: b.status })
                  }
                >
                  <TableCell className="font-mono text-xs tracking-wide">
                    {b.reference_code}
                    {cart && (
                      <span
                        className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide whitespace-nowrap"
                        style={{ backgroundColor: `hsl(${cart.hue} 70% 55% / 0.15)`, color: `hsl(${cart.hue} 70% 70%)` }}
                        title={`Part of a ${cart.total}-slot cart (one payment)`}
                      >
                        🛒 {cart.code} · {cart.pos}/{cart.total}
                      </span>
                    )}
                  </TableCell>
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
                  <TableCell>{pesos(b.total_cents)}</TableCell>
                  <TableCell className={cn("text-xs", pendingPayment ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {bookingPaymentLabel(b.payment_method, b.payment_status)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[b.status] ?? "secondary"}>{b.status}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatInTimezone(new Date(b.created_at), "MMM d, h:mm a", timezone)}
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
