"use client";

import { useRouter } from "next/navigation";
import { SessionForm, type CourtOption, type HostOption, type SessionDraft } from "../session-form";

// Thin client wrapper: the edit form lives on a server-rendered detail page, so after a save
// we refresh the route to pull the updated session back down.
export function SessionEdit({
  venueId,
  courts,
  hosts,
  draft,
}: {
  venueId: string;
  courts: CourtOption[];
  hosts: HostOption[];
  draft: SessionDraft;
}) {
  const router = useRouter();
  return (
    <SessionForm venueId={venueId} courts={courts} hosts={hosts} session={draft} onSaved={() => router.refresh()} />
  );
}
