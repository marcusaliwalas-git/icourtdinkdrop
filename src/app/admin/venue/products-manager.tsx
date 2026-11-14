"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addProduct, updateProduct, deleteProduct, setProductAvailability } from "./actions";

export type Product = {
  id: string;
  name: string;
  price_cents: number;
  category: string | null;
  is_active: boolean;
  track_stock: boolean;
  stock: number | null;
  available: boolean;
};

const LOW_STOCK = 5;

function pesos(cents: number) {
  return `₱${(cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

/** Add or edit one catalog item in a popup. `item` undefined = add mode. */
function ProductDialog({
  venueId,
  item,
  trigger,
}: {
  venueId: string;
  item?: Product;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    if (!item) formData.set("venueId", venueId);
    setError(null);
    startTransition(async () => {
      const result = item ? await updateProduct(item.id, formData) : await addProduct(formData);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  function onDelete() {
    if (!item) return;
    setError(null);
    startDeleteTransition(async () => {
      const result = await deleteProduct(item.id);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.name}` : "Add item"}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="prodName">Name</Label>
            <Input id="prodName" name="name" defaultValue={item?.name} placeholder="e.g. Bottled water" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prodPrice">Price (₱)</Label>
            <Input
              id="prodPrice"
              name="price"
              type="number"
              min={0}
              step={1}
              defaultValue={item ? item.price_cents / 100 : ""}
              placeholder="e.g. 30"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prodCategory">Category (optional)</Label>
            <Input id="prodCategory" name="category" defaultValue={item?.category ?? ""} placeholder="e.g. Drinks" />
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="trackStock"
                defaultChecked={item?.track_stock ?? false}
                className="size-4"
                onChange={(e) => {
                  const stockInput = e.currentTarget.form?.elements.namedItem("stock") as HTMLInputElement | null;
                  if (stockInput) stockInput.disabled = !e.currentTarget.checked;
                }}
              />
              Count stock
            </label>
            <p className="text-xs text-muted-foreground">
              Leave off for made-to-order items (always sellable). Turn on for packaged goods or a daily prepared
              batch — the count drops with each sale and the item goes sold out at zero.
            </p>
            <div className="flex items-center gap-2">
              <Label htmlFor="prodStock" className="shrink-0 text-sm">
                In stock
              </Label>
              <Input
                id="prodStock"
                name="stock"
                type="number"
                min={0}
                step={1}
                defaultValue={item?.stock ?? ""}
                disabled={!(item?.track_stock ?? false)}
                placeholder="e.g. 24"
                className="w-28"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="available" defaultChecked={item?.available ?? true} className="size-4" />
            Available now (uncheck to mark sold out)
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked={item?.is_active ?? true} className="size-4" />
            Show in the catalog
          </label>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <DialogFooter className="sm:col-span-2">
            {item && (
              <Button type="button" variant="ghost" className="mr-auto text-destructive" disabled={isDeleting} onClick={onDelete}>
                {isDeleting ? "Removing…" : "Remove"}
              </Button>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : item ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One-tap sold-out ("86") switch in the catalog row. */
function AvailabilityToggle({ product }: { product: Product }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="text-xs"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await setProductAvailability(product.id, !product.available);
        })
      }
    >
      {isPending ? "…" : product.available ? "Mark sold out" : "Mark available"}
    </Button>
  );
}

/** How a product's stock reads in the table. */
function StockCell({ p }: { p: Product }) {
  if (!p.available) return <Badge className="bg-destructive/15 text-destructive">Sold out</Badge>;
  if (!p.track_stock) return <span className="text-muted-foreground">Not tracked</span>;
  const n = p.stock ?? 0;
  if (n <= 0) return <Badge className="bg-destructive/15 text-destructive">Sold out</Badge>;
  if (n <= LOW_STOCK)
    return <span className="font-medium text-amber-600 dark:text-amber-400">{n} left</span>;
  return <span>{n}</span>;
}

export function ProductsManager({ venueId, products }: { venueId: string; products: Product[] }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Non-court items you sell at the desk — bottled water, snacks, merch. Staff ring these up from the Front
          desk, and the takings show up as retail revenue on the Sales report.
        </p>
        <ProductDialog venueId={venueId} trigger={<Button size="sm">Add item</Button>} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-0"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="text-muted-foreground">{p.category ?? "—"}</TableCell>
              <TableCell className="text-right whitespace-nowrap">{pesos(p.price_cents)}</TableCell>
              <TableCell className="whitespace-nowrap">
                <StockCell p={p} />
              </TableCell>
              <TableCell>
                {p.is_active ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Inactive
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <AvailabilityToggle product={p} />
                  <ProductDialog
                    venueId={venueId}
                    item={p}
                    trigger={
                      <Button size="sm" variant="outline">
                        Edit
                      </Button>
                    }
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
          {products.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No items yet. Add water, snacks, or merch to sell them at the desk.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
