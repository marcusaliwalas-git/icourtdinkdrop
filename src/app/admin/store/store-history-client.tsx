"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { voidProductSale } from "@/app/admin/front-desk/store-actions";

export type HistorySale = {
  id: string;
  timeLabel: string;
  dayKey: string;
  dayLabel: string;
  totalCents: number;
  method: string;
  remarks: string | null;
  cashier: string | null;
  items: { name: string; quantity: number }[];
};

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
}

export function StoreHistory({ sales }: { sales: HistorySale[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sales;
    return sales.filter(
      (s) =>
        s.items.some((i) => i.name.toLowerCase().includes(needle)) ||
        (s.cashier ?? "").toLowerCase().includes(needle) ||
        (s.remarks ?? "").toLowerCase().includes(needle) ||
        s.method.toLowerCase().includes(needle)
    );
  }, [q, sales]);

  // Sales arrive newest-first, so grouping in encounter order keeps days in descending order.
  const groups = useMemo(() => {
    const map = new Map<string, { dayLabel: string; rows: HistorySale[]; subtotal: number }>();
    for (const s of filtered) {
      const g = map.get(s.dayKey) ?? { dayLabel: s.dayLabel, rows: [], subtotal: 0 };
      g.rows.push(s);
      g.subtotal += s.totalCents;
      map.set(s.dayKey, g);
    }
    return [...map.values()];
  }, [filtered]);

  const total = filtered.reduce((sum, s) => sum + s.totalCents, 0);

  function onVoid(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await voidProductSale(id);
      if (!result.success) setError(result.message ?? "Couldn't void that sale.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search item, cashier, reference"
          className="h-10 max-w-xs"
        />
        <p className="text-sm text-muted-foreground">
          {filtered.length} sale{filtered.length === 1 ? "" : "s"} · <span className="font-semibold text-foreground">{pesos(total)}</span>
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {sales.length === 0 ? "No retail sales in this range." : "No sales match your search."}
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.dayLabel} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between pt-2">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.dayLabel}</h2>
              <span className="text-xs text-muted-foreground">{pesos(g.subtotal)}</span>
            </div>
            {g.rows.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/50 px-3 py-2 text-sm sm:flex-nowrap"
              >
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{s.timeLabel}</span>
                <span className="min-w-0 flex-1 truncate">
                  {s.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground capitalize">
                  {s.method}
                  {s.remarks ? ` · ${s.remarks}` : ""}
                </span>
                {s.cashier && <span className="shrink-0 text-xs text-muted-foreground">{s.cashier}</span>}
                <span className="shrink-0 font-medium">{pesos(s.totalCents)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs text-destructive"
                  disabled={isPending}
                  onClick={() => onVoid(s.id)}
                >
                  Void
                </Button>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
