"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setMemberFrontDesk } from "./actions";

/** Promote/demote a member to front-desk staff. Admins aren't shown a control (their role is
 * managed by the super admin). */
export function FrontDeskToggle({ profileId, role }: { profileId: string; role: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (role === "admin") return <span className="text-xs text-muted-foreground">—</span>;

  const isFrontDesk = role === "front_desk";
  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setMemberFrontDesk(profileId, !isFrontDesk);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" variant={isFrontDesk ? "ghost" : "outline"} disabled={isPending} onClick={toggle}>
        {isFrontDesk ? "Remove front desk" : "Make front desk"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
