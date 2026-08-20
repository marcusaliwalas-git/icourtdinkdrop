"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setSessionStatus } from "../actions";

// Which transitions we offer from each state. Publishing is what turns a draft into something
// a host can actually run; cancelling/completing close it out.
const TRANSITIONS: Record<string, { status: "draft" | "published" | "cancelled" | "completed"; label: string; variant?: "outline" | "destructive" }[]> = {
  draft: [{ status: "published", label: "Publish" }],
  published: [
    { status: "completed", label: "Mark completed", variant: "outline" },
    { status: "cancelled", label: "Cancel session", variant: "destructive" },
    { status: "draft", label: "Back to draft", variant: "outline" },
  ],
  cancelled: [{ status: "draft", label: "Reopen as draft", variant: "outline" }],
  completed: [{ status: "published", label: "Reopen", variant: "outline" }],
};

export function StatusControls({ sessionId, status }: { sessionId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const options = TRANSITIONS[status] ?? [];

  function apply(next: "draft" | "published" | "cancelled" | "completed") {
    setError(null);
    startTransition(async () => {
      const result = await setSessionStatus(sessionId, next);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <span className="text-sm text-muted-foreground">Status:</span>
      {options.map((o) => (
        <Button key={o.status} size="sm" variant={o.variant} disabled={isPending} onClick={() => apply(o.status)}>
          {o.label}
        </Button>
      ))}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
