"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { XIcon, ChevronLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatInTimezone, localDateTimeToUtc } from "@/lib/time";
import { recordProductSale, voidProductSale } from "./store-actions";
import { setProductAvailability } from "@/app/admin/venue/actions";

export type StoreProduct = {
  id: string;
  name: string;
  priceCents: number;
  category: string | null;
  trackStock: boolean;
  stock: number | null;
  available: boolean;
};

const LOW_STOCK = 5;

/** A product is sold out when 86'd or (for a counted item) out of stock. Remaining is how many more can
 * be rung up now — Infinity for untracked items. */
function soldOutOf(p: StoreProduct) {
  return !p.available || (p.trackStock && (p.stock ?? 0) <= 0);
}
function remainingOf(p: StoreProduct) {
  return p.trackStock ? Math.max(0, p.stock ?? 0) : Infinity;
}
export type StoreSale = {
  id: string;
  soldAtIso: string;
  totalCents: number;
  method: "cash" | "online" | string;
  remarks: string | null;
  items: { name: string; quantity: number }[];
};

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
}

const UNCATEGORIZED = "Other";

/** Two-pane point of sale: a searchable, category-filtered menu on the left; the live order on the
 * right. Tapping a menu card adds it to the order; the order pane carries payment, an optional
 * backdate, and the charge button. */
function PosOrder({
  venueId,
  products,
  timezone,
  storeName,
  cashierName,
  onDone,
  onClose,
}: {
  venueId: string;
  products: StoreProduct[];
  timezone: string;
  storeName: string;
  cashierName: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<"cash" | "online">("cash");
  const [remarks, setRemarks] = useState("");
  const [backdate, setBackdate] = useState(false);
  const [soldAtLocal, setSoldAtLocal] = useState(() => formatInTimezone(new Date(), "yyyy-MM-dd'T'HH:mm", timezone));
  const [received, setReceived] = useState("");
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("All");
  // On phones the two panes don't fit side by side, so we show one at a time: the menu, then the
  // order. On md+ both panes are always visible and this is ignored.
  const [mobileView, setMobileView] = useState<"menu" | "order">("menu");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(p.category?.trim() || UNCATEGORIZED);
    return ["All", ...[...set].sort()];
  }, [products]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((p) => {
      const cat = p.category?.trim() || UNCATEGORIZED;
      if (activeCat !== "All" && cat !== activeCat) return false;
      if (needle && !p.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [products, query, activeCat]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => ({ product: productById.get(id)!, qty }))
        .filter((l) => l.product),
    [cart, productById]
  );
  const total = lines.reduce((sum, l) => sum + l.product.priceCents * l.qty, 0);
  const count = lines.reduce((sum, l) => sum + l.qty, 0);

  // Cash change helper: only meaningful for cash (online is always the exact amount). Not stored —
  // it just helps the cashier count out change.
  const receivedCents = received.trim() === "" ? null : Math.round(Number(received) * 100);
  const changeCents = receivedCents != null && Number.isFinite(receivedCents) ? receivedCents - total : null;
  const underpaid = method === "cash" && receivedCents != null && Number.isFinite(receivedCents) && receivedCents < total;

  function setQty(id: string, qty: number) {
    const p = productById.get(id);
    const capped = p ? Math.min(qty, remainingOf(p)) : qty;
    setCart((c) => {
      const next = { ...c };
      if (capped <= 0) delete next[id];
      else next[id] = capped;
      return next;
    });
  }

  function onToggleAvailable(p: StoreProduct) {
    startTransition(async () => {
      await setProductAvailability(p.id, !p.available);
      router.refresh();
    });
  }

  function save() {
    setError(null);
    const items = Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity }));
    if (items.length === 0) {
      setError("Add at least one item.");
      return;
    }
    let soldAt: string | null = null;
    if (backdate && soldAtLocal) {
      const [datePart, timePart] = soldAtLocal.split("T");
      if (datePart && timePart) soldAt = localDateTimeToUtc(datePart, timePart, timezone).toISOString();
    }
    startTransition(async () => {
      const result = await recordProductSale({
        venueId,
        items,
        paymentMethod: method,
        remarks: method === "online" ? remarks : null,
        soldAt,
      });
      if (!result.success) setError(result.message ?? "Something went wrong.");
      else {
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <div className="flex h-[82vh] max-h-[680px] flex-col md:flex-row">
      {/* Menu */}
      <div
        className={cn(
          "min-h-0 flex-1 flex-col gap-3 p-4",
          mobileView === "menu" ? "flex" : "hidden",
          "md:flex"
        )}
      >
        <div className="flex items-start justify-between gap-3 pr-8">
          <div>
            <h2 className="text-lg font-semibold">{storeName}</h2>
            <p className="text-xs text-muted-foreground">Cashier: {cashierName} · Front desk</p>
          </div>
        </div>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search menu"
          className="h-10"
        />

        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCat(c)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-sm transition",
                  c === activeCat
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {products.length === 0 ? "No items in the catalog yet." : "No items match."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {visible.map((p) => {
                const qty = cart[p.id] ?? 0;
                const soldOut = soldOutOf(p);
                const remaining = remainingOf(p);
                const atMax = qty >= remaining;
                const low = p.trackStock && !soldOut && (p.stock ?? 0) <= LOW_STOCK;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "relative flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-3 text-left transition",
                      soldOut ? "opacity-60" : "hover:border-primary/50 hover:bg-accent"
                    )}
                  >
                    <button
                      type="button"
                      disabled={isPending || soldOut || atMax}
                      onClick={() => setQty(p.id, qty + 1)}
                      className="flex w-full flex-col items-start gap-1 text-left disabled:cursor-not-allowed"
                      aria-label={soldOut ? `${p.name} sold out` : `Add ${p.name}`}
                    >
                      <span className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                        {p.category?.trim() || UNCATEGORIZED}
                      </span>
                      <span className="leading-tight font-medium">{p.name}</span>
                      <span className="mt-1 text-sm">{pesos(p.priceCents)}</span>
                    </button>
                    {soldOut ? (
                      <span className="mt-0.5 rounded bg-destructive/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-destructive">
                        Sold out
                      </span>
                    ) : low ? (
                      <span className="mt-0.5 text-[0.7rem] font-medium text-amber-600 dark:text-amber-400">
                        {p.stock} left
                      </span>
                    ) : null}
                    {/* "86" switch so on-shift staff can flip availability without catalog access. */}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => onToggleAvailable(p)}
                      className="absolute bottom-1.5 right-2 text-[0.65rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {p.available ? "Sold out?" : "Restore"}
                    </button>
                    {qty > 0 && (
                      <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {qty}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Phone-only: jump to the order to review and charge. */}
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 md:hidden">
          <div>
            <p className="text-xs text-muted-foreground">
              {count} item{count === 1 ? "" : "s"}
            </p>
            <p className="text-lg font-bold tabular-nums">{pesos(total)}</p>
          </div>
          <Button type="button" onClick={() => setMobileView("order")}>
            Review order →
          </Button>
        </div>
      </div>

      {/* Order */}
      <div
        className={cn(
          "min-h-0 w-full flex-col border-t bg-muted/30 md:w-80 md:border-t-0 md:border-l",
          mobileView === "order" ? "flex" : "hidden",
          "md:flex"
        )}
      >
        <div className="flex items-center justify-between gap-2 p-4 pb-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => setMobileView("menu")}
              aria-label="Back to menu"
            >
              <ChevronLeftIcon />
            </Button>
            <h3 className="font-semibold">New sale</h3>
          </div>
          <div className="flex items-center gap-1">
            {count > 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={isPending} onClick={() => setCart({})}>
                Clear
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close register">
              <XIcon />
            </Button>
          </div>
        </div>

        <div className="flex gap-2 px-4 pb-2">
          <Button
            type="button"
            size="sm"
            className="flex-1"
            variant={method === "cash" ? "default" : "outline"}
            disabled={isPending}
            onClick={() => setMethod("cash")}
          >
            Cash
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1"
            variant={method === "online" ? "default" : "outline"}
            disabled={isPending}
            onClick={() => setMethod("online")}
          >
            Online
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 py-10 text-center">
              <p className="text-sm font-medium">No items yet</p>
              <p className="text-xs text-muted-foreground">Tap a menu item to start the order.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2 py-1">
              {lines.map(({ product, qty }) => (
                <li key={product.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{pesos(product.priceCents)} each</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="size-7 p-0"
                      disabled={isPending}
                      onClick={() => setQty(product.id, qty - 1)}
                      aria-label={`Remove one ${product.name}`}
                    >
                      −
                    </Button>
                    <span className="w-5 text-center text-sm tabular-nums">{qty}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="size-7 p-0"
                      disabled={isPending || qty >= remainingOf(product)}
                      onClick={() => setQty(product.id, qty + 1)}
                      aria-label={`Add one ${product.name}`}
                    >
                      +
                    </Button>
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm font-medium">
                    {pesos(product.priceCents * qty)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {method === "online" && (
          <div className="px-4 pt-2">
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Bank & reference, e.g. BPI · ref 1234567"
              className="h-8 text-xs"
            />
          </div>
        )}

        {method === "cash" && count > 0 && (
          <div className="flex items-center gap-2 px-4 pt-2">
            <label htmlFor="received" className="shrink-0 text-xs text-muted-foreground">
              Cash received
            </label>
            <Input
              id="received"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder="—"
              className="h-8 w-24 text-sm"
            />
            {changeCents != null && changeCents >= 0 && (
              <span className="ml-auto text-sm">
                Change <span className="font-semibold">{pesos(changeCents)}</span>
              </span>
            )}
            {underpaid && <span className="ml-auto text-sm text-destructive">Short {pesos(total - (receivedCents ?? 0))}</span>}
          </div>
        )}

        <div className="px-4 pt-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={backdate}
              disabled={isPending}
              onChange={(e) => setBackdate(e.target.checked)}
              className="size-3.5"
            />
            Record for an earlier time
          </label>
          {backdate && (
            <Input
              type="datetime-local"
              value={soldAtLocal}
              max={formatInTimezone(new Date(), "yyyy-MM-dd'T'HH:mm", timezone)}
              onChange={(e) => setSoldAtLocal(e.target.value)}
              className="mt-2 h-8 w-full text-xs"
            />
          )}
        </div>

        {error && <p className="px-4 pt-2 text-sm text-destructive">{error}</p>}

        <div className="mt-2 border-t border-border/60 p-4">
          <div className="mb-1 flex items-center justify-between text-sm text-muted-foreground">
            <span>Items</span>
            <span className="tabular-nums">{count}</span>
          </div>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-bold tabular-nums">{pesos(total)}</span>
          </div>
          <Button
            type="button"
            className="h-12 w-full text-base"
            disabled={isPending || count === 0 || underpaid}
            onClick={save}
          >
            {isPending ? "Saving…" : `Charge ${pesos(total)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Today's retail sales, each voidable. */
function SalesList({ sales, timezone, onNew }: { sales: StoreSale[]; timezone: string; onNew: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onVoid(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await voidProductSale(id);
      if (!result.success) setError(result.message ?? "Couldn't void that sale.");
      else router.refresh();
    });
  }

  const time = (iso: string) => formatInTimezone(new Date(iso), "h:mm a", timezone);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Today</h4>
        <Link href="/admin/store" className="text-xs text-primary underline-offset-2 hover:underline">
          All sales history →
        </Link>
      </div>

      <Button type="button" onClick={onNew} className="w-full">
        New sale
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {sales.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No retail sales yet today.</p>
      ) : (
        <ul className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
          {sales.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2 text-sm">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">{time(s.soldAtIso)}</span>
              <span className="min-w-0 flex-1 truncate">
                {s.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground capitalize">
                {s.method}
                {s.remarks ? ` · ${s.remarks}` : ""}
              </span>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact front-desk entry point: a one-line Store summary that opens the register in a popup, so
 * the sales list never crowds the booking board. */
export function StoreRegister({
  venueId,
  products,
  sales,
  timezone,
  storeName,
  cashierName,
}: {
  venueId: string;
  products: StoreProduct[];
  sales: StoreSale[];
  timezone: string;
  storeName: string;
  cashierName: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "new">("list");
  const todayTotal = sales.reduce((sum, s) => sum + s.totalCents, 0);

  function openAt(next: "list" | "new") {
    setMode(next);
    setOpen(true);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
      <div>
        <h2 className="text-sm font-semibold">Store</h2>
        <p className="text-xs text-muted-foreground">
          {sales.length === 0
            ? "No retail sales yet today."
            : `${pesos(todayTotal)} from ${sales.length} sale${sales.length === 1 ? "" : "s"} today`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => openAt("list")}>
          View sales
        </Button>
        <Button size="sm" onClick={() => openAt("new")}>
          New sale
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={mode === "list"}
          className={mode === "new" ? "gap-0 overflow-hidden p-0 sm:max-w-[min(960px,95vw)]" : "sm:max-w-md"}
        >
          {mode === "new" ? (
            <>
              <DialogTitle className="sr-only">New sale</DialogTitle>
              <PosOrder
                venueId={venueId}
                products={products}
                timezone={timezone}
                storeName={storeName}
                cashierName={cashierName}
                onDone={() => setMode("list")}
                onClose={() => setOpen(false)}
              />
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Store register</DialogTitle>
              </DialogHeader>
              <SalesList sales={sales} timezone={timezone} onNew={() => setMode("new")} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
