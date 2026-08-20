import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { formatInTimezone } from "@/lib/time";
import { SESSION_FORMAT_LABELS, type SessionFormat } from "@/lib/validation/session";
import { STATUS_BADGE } from "@/lib/session-display";

export const dynamic = "force-dynamic";

type HostSessionRow = {
  id: string;
  title: string;
  format: SessionFormat;
  starts_at: string;
  ends_at: string;
  status: string;
  venues: { timezone: string } | null;
};

export default async function HostHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/host");

  // RLS does the scoping: sessions_host_select returns the caller's own assigned sessions,
  // and admins see everything via sessions_admin_all. No explicit host_id filter needed.
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, title, format, starts_at, ends_at, status, venues(timezone)")
    .order("starts_at", { ascending: false })
    .limit(100)
    .returns<HostSessionRow[]>();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Your sessions</h1>
        <p className="text-sm text-muted-foreground">Open a session to run court rotation and check players in.</p>
      </div>

      {!sessions || sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          No sessions assigned to you yet. An admin assigns you as a session&rsquo;s host.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => {
            const tz = s.venues?.timezone ?? "Asia/Manila";
            const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.draft;
            return (
              <li key={s.id}>
                <Link
                  href={`/host/sessions/${s.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-4 transition-colors hover:border-primary/50 hover:bg-muted/30"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.title}</span>
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {SESSION_FORMAT_LABELS[s.format]} · {formatInTimezone(new Date(s.starts_at), "EEE d MMM, h:mm a", tz)}
                    </span>
                  </div>
                  <span className="text-sm text-primary">Run →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
