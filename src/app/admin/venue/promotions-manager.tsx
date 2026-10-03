"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
const TYPE_OPTIONS = Object.values(PROMO_TYPES).map((t) => ({
  key: t.key,
  label: t.label,
  formFields: t.formFields,
}));

const ELIGIBILITY_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "members_only", label: "Members only" },
  { value: "guests_only", label: "Guests only (not on member rate)" },
];

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
        <Input
          type="number"
          name={field.name}
          min={0}
          step={1}
          defaultValue={typeof current === "number" ? current : ""}
          required={field.required}
        />
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

function PromoRow({ promo }: { promo: Promotion }) {
  const type = PROMO_TYPES[promo.type];
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updatePromotion(promo.id, formData);
      if (result.error) setError(result.error);
    });
  }

  return (
    <form action={onSave} className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{promo.name}</span>
          <Badge variant="secondary" className="text-[10px] font-normal">{type?.label ?? promo.type}</Badge>
          {!promo.active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">{configSummary(promo)}</span>
      </div>

      <input type="hidden" name="type" value={promo.type} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Name</Label>
          <Input name="name" defaultValue={promo.name} required />
        </div>
        {type?.formFields.map((f) => (
          <ConfigField key={f.name} field={f} config={promo.config} />
        ))}
        <CommonFields promo={promo} />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isDeleting}
          onClick={() => startDeleteTransition(async () => void (await deletePromotion(promo.id)))}
        >
          Remove
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}

function AddPromoForm({ venueId }: { venueId: string }) {
  const [typeKey, setTypeKey] = useState(TYPE_OPTIONS[0]?.key ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const selectedType = TYPE_OPTIONS.find((t) => t.key === typeKey);

  function onAdd(formData: FormData) {
    formData.set("venueId", venueId);
    setError(null);
    startTransition(async () => {
      const result = await addPromotion(formData);
      if (result.error) setError(result.error);
    });
  }

  return (
    <form action={onAdd} className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-border/60 p-3 sm:grid-cols-2">
      <p className="text-sm font-medium sm:col-span-2">Add a promotion</p>
      <div className="flex flex-col gap-1.5">
        <Label>Type</Label>
        <select name="type" value={typeKey} onChange={(e) => setTypeKey(e.target.value)} className={selectClass()}>
          {TYPE_OPTIONS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Name</Label>
        <Input name="name" placeholder="e.g. Multi-court discount" required />
      </div>
      {selectedType?.formFields.map((f) => (
        <ConfigField key={f.name} field={f} />
      ))}
      <CommonFields />
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add promotion"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}

export function PromotionsManager({ venueId, promotions }: { venueId: string; promotions: Promotion[] }) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Automatic discounts applied at checkout — e.g. a multi-court discount when someone books several
        courts together. Promotions apply to the public booking cart; the discount shows before the
        customer pays and is recorded on each booking.
      </p>

      <div className="flex flex-col gap-3">
        {promotions.map((p) => (
          <PromoRow key={p.id} promo={p} />
        ))}
        {promotions.length === 0 && <p className="text-sm text-muted-foreground">No promotions yet. Add one below.</p>}
      </div>

      <AddPromoForm venueId={venueId} />
    </div>
  );
}
