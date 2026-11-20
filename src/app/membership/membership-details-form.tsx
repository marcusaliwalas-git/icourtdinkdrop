"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { validateMembershipDetails, type MembershipFieldSpec } from "@/lib/memberships/fields";
import { updateMyMembershipDetails } from "./actions";
import { MembershipFieldInputs } from "./membership-field-inputs";

/** Self-serve "your details" form for an active member — prefilled from what's on file, so members who
 * joined before their tier defined these fields can add them without renewing. */
export function MembershipDetailsForm({
  fields,
  initial,
}: {
  fields: MembershipFieldSpec[];
  initial: Record<string, string>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const missingRequired = fields.some((f) => f.required && !(values[f.key] ?? "").trim());

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const check = validateMembershipDetails(fields, values);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    startTransition(async () => {
      const result = await updateMyMembershipDetails(values);
      if (!result.success) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div>
        <p className="text-sm font-medium">Your membership details</p>
        <p className="text-xs text-muted-foreground">
          {missingRequired
            ? "Your venue needs a few more details for your membership — please complete them."
            : "Keep these up to date for your venue."}
        </p>
      </div>

      <MembershipFieldInputs fields={fields} values={values} onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))} idPrefix="md" />

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved — thank you!</p>}

      <Button type="submit" size="sm" className="self-start" disabled={isPending}>
        {isPending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}
