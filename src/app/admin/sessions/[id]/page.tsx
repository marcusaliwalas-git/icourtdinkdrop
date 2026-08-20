import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatInTimezone } from "@/lib/time";
import { SESSION_FORMAT_LABELS, type SessionFormat } from "@/lib/validation/session";
import { hostLabel, signupName, STATUS_BADGE } from "@/lib/session-display";
import { type SessionDraft } from "../session-form";
import { SessionEdit } from "./session-edit";
import { StatusControls } from "./status-controls";
import { RosterManager, type RosterEntry } from "./roster-manager";

export const dynamic = "force-dynamic";

type SignupRow = {
  id: string;
  guest_name: string | null;
  status: string;
  checked_in_at: string | null;
  last_played_at: string | null;
  profile_id: string | null;
  profiles: { full_name: string | null; phone: string | null } | null;
};

export default async function AdminSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("*, venues(timezone)")
    .eq("id", id)
    .maybeSingle();

  if (!session) notFound();

  const tz = (session.venues as { timezone: string } | null)?.timezone ?? "Asia/Manila";
  const format = session.format as SessionFormat;

  const [{ data: courts }, { data: hostProfiles }, { data: signups }] = await Promise.all([
    supabase.from("courts").select("id, name").eq("venue_id", session.venue_id).eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, full_name, phone").in("role", ["organizer", "admin"]).order("full_name"),
    supabase
      .from("session_signups")
      .select("id, guest_name, status, checked_in_at, last_played_at, profile_id, profiles(full_name, phone)")
      .eq("session_id", id)
      .order("created_at", { ascending: true })
      .returns<SignupRow[]>(),
  ]);

  const hosts = (hostProfiles ?? []).map((p) => ({ id: p.id, name: hostLabel(p.full_name, p.phone) }));

  const draft: SessionDraft = {
    id: session.id,
    title: session.title,
    description: session.description,
    format,
    startsAtLocal: formatInTimezone(new Date(session.starts_at), "yyyy-MM-dd'T'HH:mm", tz),
    endsAtLocal: formatInTimezone(new Date(session.ends_at), "yyyy-MM-dd'T'HH:mm", tz),
    capacity: session.capacity,
    priceCents: session.price_cents,
    courtIds: session.courts_used ?? [],
    hostId: session.host_id,
  };

  const roster: RosterEntry[] = (signups ?? []).map((s) => ({
    id: s.id,
    name: signupName(s.profiles?.full_name, s.guest_name),
    isGuest: !s.profile_id,
    checkedIn: !!s.checked_in_at,
  }));

  const badge = STATUS_BADGE[session.status] ?? STATUS_BADGE.draft;
  const checkedIn = roster.filter((r) => r.checkedIn).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/sessions" className="text-sm text-muted-foreground hover:text-foreground">
          ← All sessions
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{session.title}</h1>
            <Badge className={badge.className}>{badge.label}</Badge>
          </div>
          <Button asChild variant="outline">
            <Link href={`/host/sessions/${session.id}`}>Open run screen →</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {SESSION_FORMAT_LABELS[format]} · {formatInTimezone(new Date(session.starts_at), "EEE d MMM yyyy, h:mm a", tz)}
          {" – "}
          {formatInTimezone(new Date(session.ends_at), "h:mm a", tz)}
        </p>
      </div>

      <StatusControls sessionId={session.id} status={session.status} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-lg border border-border/60 p-4">
          <h2 className="font-medium">Details</h2>
          <SessionEdit venueId={session.venue_id} courts={courts ?? []} hosts={hosts} draft={draft} />
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border/60 p-4">
          <h2 className="font-medium">
            Roster · {checkedIn} checked in / {roster.length}
          </h2>
          <RosterManager sessionId={session.id} entries={roster} />
        </section>
      </div>
    </div>
  );
}
