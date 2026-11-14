"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { type MembershipFieldSpec } from "@/lib/memberships/fields";
import { MembershipFieldInputs } from "@/app/membership/membership-field-inputs";
import { setMemberMembershipDetails } from "../actions";

/** Admin on-behalf editor for a member's custom membership details (backfill / counter capture). */
export function MemberDetailsForm({
  profileId,
  tier,
  fields,
  initial,
}: {
  profileId: string;
  tier: string;
  fields: MembershipFieldSpec[];
  initial: Record<string, string>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setMemberMembershipDetails(profileId, values);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-3 rounded-xl border border-white/[0.08] bg-card p-4">
      <div>
        <p className="text-sm font-medium">Membership details — {tier}</p>
        <p className="text-xs text-muted-foreground">Record these on the member&rsquo;s behalf (e.g. collected at the counter).</p>
      </div>

      <MembershipFieldInputs fields={fields} values={values} onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))} idPrefix="amd" />

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}

      <Button type="submit" size="sm" className="self-start" disabled={isPending}>
        {isPending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}
