"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from "@/lib/expenses";
import { addExpense, deleteExpense } from "./actions";

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });
}

type Expense = {
  id: string;
  incurred_on: string;
  amount_cents: number;
  category: string;
  note: string | null;
};

export function ExpensesManager({
  venueId,
  defaultDate,
  expenses,
}: {
  venueId: string;
  defaultDate: string;
  expenses: Expense[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].key);
  const [note, setNote] = useState("");

  function onAdd() {
    setError(null);
    if (!amount || Number(amount) <= 0) {
      setError("Enter an amount.");
      return;
    }
    const fd = new FormData();
    fd.set("venueId", venueId);
    fd.set("incurredOn", date);
    fd.set("amount", amount);
    fd.set("category", category);
    fd.set("note", note);
    startTransition(async () => {
      const result = await addExpense(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAmount("");
      setNote("");
      router.refresh();
    });
  }

  function onDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteExpense(id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add form */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.08] bg-card p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exDate">Date</Label>
          <Input id="exDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exAmount">Amount (PHP)</Label>
          <Input
            id="exAmount"
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exCategory">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="exCategory" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="exNote">Note (optional)</Label>
          <Input id="exNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. August Meralco bill" />
        </div>
        <Button onClick={onAdd} disabled={isPending}>
          {isPending ? "Saving…" : "Add expense"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* List */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Note</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap">{e.incurred_on}</TableCell>
              <TableCell>{expenseCategoryLabel(e.category)}</TableCell>
              <TableCell className="text-muted-foreground">{e.note ?? "—"}</TableCell>
              <TableCell className="text-right whitespace-nowrap">{pesos(e.amount_cents)}</TableCell>
              <TableCell>
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onDelete(e.id)}>
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {expenses.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No expenses logged for this month.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
