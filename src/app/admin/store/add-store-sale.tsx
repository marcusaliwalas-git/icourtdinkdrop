"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localDateTimeToUtc } from "@/lib/time";
import { recordProductSale, type SaleItemInput } from "@/app/admin/front-desk/store-actions";

export type AddSaleProduct = { id: string; name: string; priceCents: number };

const CUSTOM = "__custom__";

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
}

/** Log a retail sale straight from the Store report — the same idea as adding an expense, for when a
 * sale wasn't rung up on the front desk (backfilling a past day, a sale taken elsewhere). Pick a
 * catalog item, or choose "Custom item" to type a one-off name + price that isn't in the catalog. One
 * item per entry; use the front-desk register for multi-item orders. */
export function AddStoreSale({
  venueId,
  products,
  defaultDate,
  today,
  timezone,
}: {
  venueId: string;
  products: AddSaleProduct[];
  defaultDate: string;
  today: string;
  timezone: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [productId, setProductId] = useState<string>(products[0]?.id ?? CUSTOM);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [method, setMethod] = useState<"cash" | "online">("cash");
  const [note, setNote] = useState("");

  const isCustom = productId === CUSTOM;
  const product = products.find((p) => p.id === productId);
  const quantity = Math.max(1, Math.trunc(Number(qty) || 0));
  const customCents = customPrice.trim() === "" ? NaN : Math.round(Number(customPrice) * 100);
  const unitCents = isCustom ? (Number.isFinite(customCents) ? customCents : 0) : (product?.priceCents ?? 0);
  const lineTotal = unitCents * quantity;

  function onAdd() {
    setError(null);
    let item: SaleItemInput;
    if (isCustom) {
      if (!customName.trim()) {
        setError("Give the custom item a name.");
        return;
      }
      if (!Number.isFinite(customCents) || customCents < 0) {
        setError("Enter a valid price for the custom item.");
        return;
      }
      item = { name: customName.trim(), unitPriceCents: customCents, quantity };
    } else {
      if (!productId) {
        setError("Pick an item.");
        return;
      }
      item = { productId, quantity };
    }
    // A date other than today is backdated to noon (venue-local); today records at the current time.
    const soldAt = date === today ? null : localDateTimeToUtc(date, "12:00", timezone).toISOString();
    startTransition(async () => {
      const result = await recordProductSale({
        venueId,
        items: [item],
        paymentMethod: method,
        remarks: note.trim() || null,
        soldAt,
      });
      if (!result.success) {
        setError(result.message ?? "Couldn't add that sale.");
        return;
      }
      setQty("1");
      setNote("");
      if (isCustom) {
        setCustomName("");
        setCustomPrice("");
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.08] bg-card p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="saleDate">Date</Label>
          <Input
            id="saleDate"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="saleItem">Item</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger id="saleItem" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {pesos(p.priceCents)}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>Custom item…</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isCustom && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customName">Name</Label>
              <Input
                id="customName"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Grip tape"
                className="w-44"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customPrice">Price (PHP)</Label>
              <Input
                id="customPrice"
                type="number"
                min={0}
                step="0.01"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="w-28"
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="saleQty">Qty</Label>
          <Input
            id="saleQty"
            type="number"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="saleMethod">Payment</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as "cash" | "online")}>
            <SelectTrigger id="saleMethod" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="online">Online</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="saleNote">{method === "online" ? "Bank & reference" : "Note (optional)"}</Label>
          <Input
            id="saleNote"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={method === "online" ? "e.g. BPI · ref 1234567" : "optional"}
          />
        </div>
        <Button onClick={onAdd} disabled={isPending}>
          {isPending ? "Saving…" : `Add sale${lineTotal > 0 ? ` · ${pesos(lineTotal)}` : ""}`}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
