// Small presentational helpers shared by the admin session screens and the host run board.

export function hostLabel(fullName: string | null, phone: string | null): string {
  if (fullName && fullName.trim()) return fullName.trim();
  if (phone && phone.trim()) return phone.trim();
  return "Unnamed member";
}

/** A signup's display name: member's profile name, else the guest name, else a fallback. */
export function signupName(fullName: string | null | undefined, guestName: string | null | undefined): string {
  return (fullName && fullName.trim()) || (guestName && guestName.trim()) || "Player";
}

export const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  published: { label: "Published", className: "bg-primary/15 text-primary" },
  cancelled: { label: "Cancelled", className: "bg-destructive/15 text-destructive" },
  completed: { label: "Completed", className: "bg-foreground/10 text-foreground" },
};
