import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { formatInTimezone } from "@/lib/time";
import { SESSION_FORMAT_LABELS, type SessionFormat } from "@/lib/validation/session";
import { NewSessionDialog } from "./new-session-dialog";
import { hostLabel, STATUS_BADGE } from "@/lib/session-display";

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  title: string;
  format: SessionFormat;
  starts_at: string;
  ends_at: string;
  status: string;
  capacity: number;
  courts_used: string[];
  host: { full_name: string | null } | null;
  session_signups: { count: number }[];
};

export default async function AdminSessionsPage() {
  const supabase = await createClient();

  const { data: venue } = await supabase
    .from("venues")
    .select("id, timezone")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!venue) {
    return <p className="text-muted-foreground">Set up your venue first.</p>;
  }
  const tz = venue.timezone ?? "Asia/Manila";

  const [{ data: courts }, { data: hostProfiles }, { data: sessions }] = await Promise.all([
    supabase.from("courts").select("id, name").eq("venue_id", venue.id).eq("is_active", true).order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("role", ["organizer", "admin"])
      .order("full_name"),
    supabase
      .from("sessions")
      .select("id, title, format, starts_at, ends_at, status, capacity, courts_used, host:profiles(full_name), session_signups(count)")
      .eq("venue_id", venue.id)
      .order("starts_at", { ascending: false })
      .limit(200)
      .returns<SessionRow[]>(),
  ]);

  const hosts = (hostProfiles ?? []).map((p) => ({ id: p.id, name: hostLabel(p.full_name, p.phone) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            Open-play &amp; challenge-court events. Assign a host to let them run court rotation.
          </p>
        </div>
        <NewSessionDialog venueId={venue.id} courts={courts ?? []} hosts={hosts} />
      </div>

      {!sessions || sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          No sessions yet. Create one to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => {
            const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.draft;
            const signups = s.session_signups?.[0]?.count ?? 0;
            return (
              <li key={s.id}>
                <Link
                  href={`/admin/sessions/${s.id}`}
                  className="flex flex-col gap-2 rounded-lg border border-border/60 p-4 transition-colors hover:border-primary/50 hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.title}</span>
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {SESSION_FORMAT_LABELS[s.format]} · {formatInTimezone(new Date(s.starts_at), "EEE d MMM, h:mm a", tz)}
                      {" – "}
                      {formatInTimezone(new Date(s.ends_at), "h:mm a", tz)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{s.courts_used?.length ?? 0} courts</span>
                    <span>
                      {signups}/{s.capacity} players
                    </span>
                    <span>{s.host?.full_name ? `Host: ${s.host.full_name}` : "No host"}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
