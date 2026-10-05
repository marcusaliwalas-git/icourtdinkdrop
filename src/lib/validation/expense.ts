import { z } from "zod";
import { EXPENSE_CATEGORY_KEYS } from "@/lib/expenses";

export const expenseSchema = z.object({
  venueId: z.uuid(),
  incurredOn: z.iso.date(),
  amountCents: z.number().int().min(0),
  category: z.enum(EXPENSE_CATEGORY_KEYS),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;

export const expenseUpdateSchema = expenseSchema.omit({ venueId: true });

export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;
