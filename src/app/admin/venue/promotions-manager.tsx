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
import { PROMO_TYPES } from "@/lib/promos/registry";
import type { PromoFormField } from "@/lib/promos/engine";
import { addPromotion, updatePromotion, deletePromotion } from "./actions";

export type Promotion = {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  eligibility: string;
  stackable: boolean;
  priority: number;
  active: boolean;
  starts_on: string | null;
  ends_on: string | null;
};

// Lightweight view of the registry for the form (key + label + fields), newest-friendly: a new promo
// type shows up here automatically.
const TYPE_OPTIONS = Object.values(PROMO_TYPES).map((t) => ({ key: t.key, label: t.label, formFields: t.formFields }));

const ELIGIBILITY_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "members_only", label: "Members only" },
  { value: "guests_only", label: "Guests only (not on member rate)" },
];
const ELIGIBILITY_SHORT: Record<string, string> = { all: "Everyone", members_only: "Members", guests_only: "Guests" };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const peso = (cents: number) => `₱${(cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

function selectClass() {
  return "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30";
}

/** Render one type-specific field from its formFields spec, prefilled from an existing config. */
function ConfigField({ field, config }: { field: PromoFormField; config?: Record<string, unknown> }) {
  const current = config?.[field.name];
  if (field.kind === "money") {
    const pesos = typeof current === "number" ? current / 100 : "";
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{field.label} (₱)</Label>
        <Input type="number" name={field.name} min={0} step={1} defaultValue={pesos} required={field.required} />
        {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
      </div>
    );
  }
  if (field.kind === "number") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{field.label}</Label>
        <Input type="number" name={field.name} min={0} step={1} defaultValue={typeof current === "number" ? current : ""} required={field.required} />
        {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
      </div>
    );
  }
  if (field.kind === "time") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{field.label}</Label>
        <Input type="time" name={field.name} defaultValue={typeof current === "string" ? current : ""} required={field.required} />
      </div>
    );
  }
  if (field.kind === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{field.label}</Label>
        <select name={field.name} defaultValue={typeof current === "string" ? current : ""} className={selectClass()}>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
  // weekdays
  const selected = Array.isArray(current) ? (current as number[]) : [];
  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label>{field.label}</Label>
      <div className="flex flex-wrap gap-3">
        {DAYS.map((d, i) => (
          <label key={i} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name={field.name} value={i} defaultChecked={selected.includes(i)} className="size-4" />
            {d}
          </label>
        ))}
      </div>
    </div>
  );
}

/** The common (type-independent) fields, shared by the add and edit forms. */
function CommonFields({ promo }: { promo?: Promotion }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label>Eligibility</Label>
        <select name="eligibility" defaultValue={promo?.eligibility ?? "all"} className={selectClass()}>
          {ELIGIBILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Priority</Label>
        <Input type="number" name="priority" step={1} defaultValue={promo?.priority ?? 0} />
        <p className="text-xs text-muted-foreground">Higher wins when two exclusive promos tie.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Starts on (optional)</Label>
        <Input type="date" name="startsOn" defaultValue={promo?.starts_on ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Ends on (optional)</Label>
        <Input type="date" name="endsOn" defaultValue={promo?.ends_on ?? ""} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="stackable" defaultChecked={promo?.stackable ?? false} className="size-4" />
        Can combine with other stackable promos
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={promo?.active ?? true} className="size-4" />
        Active
      </label>
    </>
  );
}

function configSummary(promo: Promotion): string {
  const type = PROMO_TYPES[promo.type];
  if (!type) return promo.type;
  const parts = type.formFields.map((f) => {
    const v = promo.config?.[f.name];
    if (f.kind === "money" && typeof v === "number") return `${f.label}: ${peso(v)}`;
    if (v == null || (Array.isArray(v) && v.length === 0)) return null;
    return `${f.label}: ${Array.isArray(v) ? v.map((i) => DAYS[i] ?? i).join("/") : v}`;
  });
  return parts.filter(Boolean).join(" · ");
}

/** Add or edit one promotion in a popup. `promo` undefined = add mode (type is selectable); in edit
 * mode the type is fixed (changing it would change the config shape). */
function PromoDialog({ venueId, promo, trigger }: { venueId: string; promo?: Promotion; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const initialType = promo?.type ?? TYPE_OPTIONS[0]?.key ?? "";
  const [typeKey, setTypeKey] = useState(initialType);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const selectedType = TYPE_OPTIONS.find((t) => t.key === typeKey);

  function onSubmit(formData: FormData) {
    if (!promo) formData.set("venueId", venueId);
    setError(null);
    startTransition(async () => {
      const result = promo ? await updatePromotion(promo.id, formData) : await addPromotion(formData);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  function onDelete() {
    if (!promo) return;
    setError(null);
    startDeleteTransition(async () => {
      const result = await deletePromotion(promo.id);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setTypeKey(initialType);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{promo ? `Edit ${promo.name}` : "Add a promotion"}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            {promo ? (
              <>
                <input type="hidden" name="type" value={promo.type} />
                <div className="flex h-9 items-center text-sm text-muted-foreground">{selectedType?.label ?? promo.type}</div>
              </>
            ) : (
              <select name="type" value={typeKey} onChange={(e) => setTypeKey(e.target.value)} className={selectClass()}>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input name="name" defaultValue={promo?.name} placeholder="e.g. Multi-court discount" required />
          </div>

          {selectedType?.formFields.map((f) => (
            <ConfigField key={f.name} field={f} config={promo?.config} />
          ))}
          <CommonFields promo={promo} />

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <DialogFooter className="sm:col-span-2">
            {promo && (
              <Button type="button" variant="ghost" className="mr-auto text-destructive" disabled={isDeleting} onClick={onDelete}>
                {isDeleting ? "Removing…" : "Remove"}
              </Button>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : promo ? "Save changes" : "Add promotion"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PromotionsManager({ venueId, promotions }: { venueId: string; promotions: Promotion[] }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Automatic discounts applied at checkout — e.g. a multi-court discount when someone books several
          courts together. Promotions apply to the public booking cart; the discount shows before the
          customer pays and is recorded on each booking.
        </p>
        <PromoDialog venueId={venueId} trigger={<Button size="sm">Add promotion</Button>} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Details</TableHead>
            <TableHead>Eligibility</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-0"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {promotions.map((p) => {
            const type = PROMO_TYPES[p.type];
            return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-muted-foreground">{type?.label ?? p.type}</TableCell>
                <TableCell className="max-w-[14rem] truncate text-xs text-muted-foreground" title={configSummary(p)}>
                  {configSummary(p)}
                </TableCell>
                <TableCell className="text-muted-foreground">{ELIGIBILITY_SHORT[p.eligibility] ?? p.eligibility}</TableCell>
                <TableCell>
                  {p.active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <PromoDialog
                    venueId={venueId}
                    promo={p}
                    trigger={
                      <Button size="sm" variant="outline">
                        Edit
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })}
          {promotions.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No promotions yet. Add one to start discounting.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
