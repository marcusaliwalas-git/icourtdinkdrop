"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { upsertCourt, setCourtTypeFilter } from "./actions";
import { RatePeriodsManager } from "./rate-periods-manager";

type Court = {
  id: string;
  name: string;
  surface: string | null;
  is_indoor: boolean;
  hourly_rate_cents: number;
  member_rate_cents: number | null;
  is_active: boolean;
};

type RatePeriod = {
  id: string;
  start_time: string;
  end_time: string;
  hourly_rate_cents: number;
  member_rate_cents: number | null;
  days_of_week: number[] | null;
};

function centsToPesos(cents: number) {
  return (cents / 100).toFixed(2);
}

function CourtForm({
  venueId,
  court,
  ratePeriods,
  onSaved,
}: {
  venueId: string;
  court: Court | null;
  ratePeriods: RatePeriod[];
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    formData.set("venueId", venueId);
    startTransition(async () => {
      const result = await upsertCourt(court?.id ?? null, formData);
      if (result.error) {
        setError(result.error);
      } else {
        onSaved();
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Court name</Label>
          <Input id="name" name="name" defaultValue={court?.name} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="surface">Surface</Label>
          <Input id="surface" name="surface" defaultValue={court?.surface ?? ""} placeholder="Cushioned acrylic" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hourlyRate">Hourly rate (PHP)</Label>
            <Input
              id="hourlyRate"
              name="hourlyRate"
              type="number"
              step="0.01"
              min={0}
              defaultValue={court ? centsToPesos(court.hourly_rate_cents) : undefined}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="memberRate">Member rate (PHP)</Label>
            <Input
              id="memberRate"
              name="memberRate"
              type="number"
              step="0.01"
              min={0}
              placeholder="Optional"
              defaultValue={
                court?.member_rate_cents != null ? centsToPesos(court.member_rate_cents) : undefined
              }
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isIndoor" defaultChecked={court?.is_indoor} className="h-4 w-4 accent-primary" />
            Indoor court
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={court?.is_active ?? true} className="h-4 w-4 accent-primary" />
            Active (bookable)
          </label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save court"}
          </Button>
        </div>
      </form>

      {court && (
        <div className="border-t pt-5">
          <RatePeriodsManager courtId={court.id} ratePeriods={ratePeriods} />
        </div>
      )}
    </div>
  );
}

export function CourtsManager({
  venueId,
  courts,
  ratePeriodsByCourtId,
  courtTypeFilter,
}: {
  venueId: string;
  courts: Court[];
  ratePeriodsByCourtId: Record<string, RatePeriod[]>;
  /** Whether the customer-facing type filter is shown on the booking page. */
  courtTypeFilter: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | "new" | null>(null);
  const [showToCustomers, setShowToCustomers] = useState(courtTypeFilter);
  const [filterPending, startFilterTransition] = useTransition();
  const [filterError, setFilterError] = useState<string | null>(null);

  function toggleCustomerFilter(next: boolean) {
    setFilterError(null);
    setShowToCustomers(next);
    startFilterTransition(async () => {
      const result = await setCourtTypeFilter(venueId, next);
      if (result.error) {
        setFilterError(result.error);
        setShowToCustomers(!next);
        return;
      }
      router.refresh();
    });
  }

  // Filter the list by surface — the venue uses this column to label court type (e.g. Pickleball,
  // Tennis). Each type is an independent on/off toggle; with none selected, every court shows.
  const NO_TYPE = "—";
  const surfaceOf = (c: Court) => c.surface?.trim() || NO_TYPE;
  const surfaces = useMemo(() => {
    const set = new Set<string>();
    for (const c of courts) set.add(surfaceOf(c));
    return [...set].sort((a, b) => (a === NO_TYPE ? 1 : b === NO_TYPE ? -1 : a.localeCompare(b)));
  }, [courts]);
  const [active, setActive] = useState<Set<string>>(new Set());

  function toggleSurface(s: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const filtered = active.size === 0 ? courts : courts.filter((c) => active.has(surfaceOf(c)));
  const pill = (on: boolean) =>
    on
      ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
      : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground";

  return (
    <div className="flex flex-col gap-4">
      {surfaces.length > 1 && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Filter by type</span>
            <button type="button" onClick={() => setActive(new Set())} className={pill(active.size === 0)}>
              All
            </button>
            {surfaces.map((s) => (
              <button key={s} type="button" onClick={() => toggleSurface(s)} className={pill(active.has(s))}>
                {s === NO_TYPE ? "No type" : s}
              </button>
            ))}
          </div>
          <label className="flex items-start gap-2.5 border-t pt-3 text-sm">
            <input
              type="checkbox"
              checked={showToCustomers}
              disabled={filterPending}
              onChange={(e) => toggleCustomerFilter(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="min-w-0">
              <span className="block font-medium">Show this filter to customers</span>
              <span className="block text-xs text-muted-foreground">
                Customers can filter the booking grid by court type (from each court&apos;s surface label).
                Off hides it. Appears only when courts have more than one type.
              </span>
              {filterError && <span className="mt-1 block text-xs text-destructive">{filterError}</span>}
            </span>
          </label>
        </div>
      )}

      <div className="flex justify-end">
        <Dialog open={openId === "new"} onOpenChange={(o) => setOpenId(o ? "new" : null)}>
          <DialogTrigger asChild>
            <Button size="sm">Add court</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add court</DialogTitle>
            </DialogHeader>
            <CourtForm venueId={venueId} court={null} ratePeriods={[]} onSaved={() => setOpenId(null)} />
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Court</TableHead>
            <TableHead>Surface</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((court) => (
            <TableRow key={court.id}>
              <TableCell>{court.name}{court.is_indoor ? " (indoor)" : ""}</TableCell>
              <TableCell>{court.surface ?? "-"}</TableCell>
              <TableCell>
                ₱{centsToPesos(court.hourly_rate_cents)}/hr
                {court.member_rate_cents != null && (
                  <span className="text-muted-foreground"> (₱{centsToPesos(court.member_rate_cents)} member)</span>
                )}
                {(ratePeriodsByCourtId[court.id]?.length ?? 0) > 0 && (
                  <span className="text-muted-foreground"> + time-based rates</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={court.is_active ? "default" : "secondary"}>
                  {court.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <Dialog open={openId === court.id} onOpenChange={(o) => setOpenId(o ? court.id : null)}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">Edit</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Edit court</DialogTitle>
                    </DialogHeader>
                    <CourtForm
                      venueId={venueId}
                      court={court}
                      ratePeriods={ratePeriodsByCourtId[court.id] ?? []}
                      onSaved={() => setOpenId(null)}
                    />
                  </DialogContent>
                </Dialog>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {courts.length === 0 ? "No courts yet." : "No courts match this filter."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
