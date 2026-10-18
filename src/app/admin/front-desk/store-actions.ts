"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { auditCurrent } from "@/lib/audit";

type ActionResult = { success: boolean; message?: string };

/** Ring up a retail sale at the desk. Items are priced from the catalog on the server (the RPC
 * ignores any client-sent price), summed into one receipt, and recorded atomically. */
/** A sale line: either a catalog product (priced on the server) or an ad-hoc one-off (name + price
 * supplied, not in the catalog — the Expenses-style "generic item"). */
export type SaleItemInput =
  | { productId: string; quantity: number }
  | { name: string; unitPriceCents: number; quantity: number };

export async function recordProductSale(input: {
  venueId: string;
  items: SaleItemInput[];
  paymentMethod: "cash" | "online";
  remarks?: string | null;
  note?: string | null;
  /** UTC ISO instant for a backdated (retroactive) sale; omit/null = now. */
  soldAt?: string | null;
}): Promise<ActionResult> {
  const items = input.items.filter((i) => i.quantity > 0);
  if (items.length === 0) return { success: false, message: "Add at least one item." };

  // Validate a backdated time: must parse and not be in the future (the RPC re-checks server-side).
  let soldAt: string | undefined;
  if (input.soldAt) {
    const when = new Date(input.soldAt);
    if (Number.isNaN(when.getTime())) return { success: false, message: "That sale time isn't valid." };
    if (when.getTime() > Date.now() + 5 * 60_000) return { success: false, message: "A sale can't be in the future." };
    soldAt = when.toISOString();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_product_sale", {
    p_venue: input.venueId,
    p_payment_method: input.paymentMethod,
    p_items: items.map((i) =>
      "productId" in i
        ? { product_id: i.productId, quantity: i.quantity }
        : { name: i.name, unit_price_cents: i.unitPriceCents, quantity: i.quantity }
    ),
    p_payment_remarks: input.remarks?.trim() || undefined,
    p_note: input.note?.trim() || undefined,
    p_sold_at: soldAt,
  });

  if (error) {
    // The RPC raises friendly codes; map the common ones, otherwise surface the message.
    const msg =
      error.code === "42501"
        ? "You don't have access to sell for this venue."
        : /NO_ITEMS/.test(error.message)
          ? "Add at least one item."
          : /ITEM_NAME_REQUIRED/.test(error.message)
            ? "Give the custom item a name."
            : /BAD_PRICE/.test(error.message)
              ? "Enter a valid price for the custom item."
              : /FUTURE_SALE/.test(error.message)
            ? "A sale can't be in the future."
            : /INSUFFICIENT_STOCK/.test(error.message)
              ? "Not enough stock for one of those items — restock it or lower the quantity."
              : /PRODUCT_UNAVAILABLE/.test(error.message)
                ? "One of those items is marked sold out."
                : /PRODUCT_NOT_FOUND/.test(error.message)
                  ? "One of those items is no longer available — refresh and try again."
                  : error.message;
    return { success: false, message: msg };
  }

  await auditCurrent(supabase, "product_sale_recorded", "product_sale", data.id, {
    total_cents: data.total_cents,
    payment_method: data.payment_method,
  });
  revalidatePath("/admin/front-desk");
  revalidatePath("/admin/store");
  return { success: true };
}

/** Void a mis-rung sale — deletes the receipt and its lines, so it drops out of the retail totals. */
export async function voidProductSale(saleId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("product_sales").delete().eq("id", saleId).select("id");
  if (error) return { success: false, message: error.message };
  if (!data?.length) return { success: false, message: "That sale isn't for your venue." };
  await auditCurrent(supabase, "product_sale_voided", "product_sale", saleId, null);
  revalidatePath("/admin/front-desk");
  revalidatePath("/admin/store");
  return { success: true };
}
