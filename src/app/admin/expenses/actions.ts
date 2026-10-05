"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { expenseSchema } from "@/lib/validation/expense";

type ActionResult = { error?: string; success?: boolean };

/** Log a venue expense. RLS (expenses_admin_write) enforces the caller is an admin of the venue,
 * so a mis-supplied venue_id is rejected at the database rather than trusted here. */
export async function addExpense(formData: FormData): Promise<ActionResult> {
  const parsed = expenseSchema.safeParse({
    venueId: formData.get("venueId"),
    incurredOn: formData.get("incurredOn"),
    amountCents: Math.round(Number(formData.get("amount")) * 100),
    category: formData.get("category"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("expenses").insert({
    venue_id: parsed.data.venueId,
    incurred_on: parsed.data.incurredOn,
    amount_cents: parsed.data.amountCents,
    category: parsed.data.category,
    note: parsed.data.note || null,
    created_by: user?.id ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/sales");
  return { success: true };
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/sales");
  return { success: true };
}
