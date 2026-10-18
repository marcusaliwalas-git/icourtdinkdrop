"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MembershipFieldSpec } from "@/lib/memberships/fields";

const textareaClass =
  "rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Renders the inputs for a tier's custom fields from its spec. Shared by the purchase flow, the
 * self-serve "your details" form, and the admin on-behalf editor. */
export function MembershipFieldInputs({
  fields,
  values,
  onChange,
  idPrefix = "mf",
}: {
  fields: MembershipFieldSpec[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  idPrefix?: string;
}) {
  return (
    <>
      {fields.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const value = values[f.key] ?? "";
        return (
          <div key={f.key} className="flex flex-col gap-1.5">
            <Label htmlFor={id}>
              {f.label}
              {f.required && <span className="text-destructive"> *</span>}
            </Label>
            {f.kind === "textarea" ? (
              <textarea id={id} value={value} onChange={(e) => onChange(f.key, e.target.value)} rows={2} className={textareaClass} />
            ) : f.kind === "select" ? (
              <select id={id} value={value} onChange={(e) => onChange(f.key, e.target.value)} className={selectClass}>
                <option value="">Select…</option>
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={id}
                type={f.kind === "email" ? "email" : f.kind === "date" ? "date" : f.kind === "phone" ? "tel" : "text"}
                value={value}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
