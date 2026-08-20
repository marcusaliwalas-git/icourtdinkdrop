import { requireSessionHost } from "@/lib/auth";
import { signupName } from "@/lib/session-display";
import { RunBoard, type BoardMatch, type BoardPlayer, type RosterPlayer } from "./run-board";

export const dynamic = "force-dynamic";

type MatchRow = {
  id: string;
  court_id: string;
  started_at: string;
  session_match_players: {
    signup_id: string;
    team: number;
    session_signups: { guest_name: string | null; profiles: { full_name: string | null } | null } | null;
  }[];
};

type SignupRow = {
  id: string;
  guest_name: string | null;
  checked_in_at: string | null;
  profile_id: string | null;
  profiles: { full_name: string | null } | null;
};

type QueueRow = { signup_id: string; name: string; waited_since: string };

export default async function HostRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Authorization: succeeds only for the assigned host or an admin (RLS-backed).
  const { supabase, session } = await requireSessionHost(id);

  const courtIds: string[] = session.courts_used ?? [];

  const courtsPromise = courtIds.length
    ? supabase.from("courts").select("id, name").in("id", courtIds).order("name")
    : Promise.resolve({ data: [] as { id: string; name: string }[] });

  const [{ data: courts }, { data: matches }, { data: signups }, { data: queue }] = await Promise.all([
    courtsPromise,
    supabase
      .from("session_matches")
      .select(
        "id, court_id, started_at, session_match_players(signup_id, team, session_signups(guest_name, profiles(full_name)))"
      )
      .eq("session_id", id)
      .is("ended_at", null)
      .returns<MatchRow[]>(),
    supabase
      .from("session_signups")
      .select("id, guest_name, checked_in_at, profile_id, profiles(full_name)")
      .eq("session_id", id)
      .order("created_at", { ascending: true })
      .returns<SignupRow[]>(),
    supabase.rpc("session_queue", { p_session_id: id }),
  ]);
  const queueRows = (queue ?? []) as QueueRow[];

  const playing = new Set<string>();
  const boardMatches: BoardMatch[] = (matches ?? []).map((m) => {
    const toPlayers = (team: number): BoardPlayer[] =>
      m.session_match_players
        .filter((p) => p.team === team)
        .map((p) => {
          playing.add(p.signup_id);
          return {
            signupId: p.signup_id,
            name: signupName(p.session_signups?.profiles?.full_name, p.session_signups?.guest_name),
          };
        });
    return { id: m.id, courtId: m.court_id, startedAtIso: m.started_at, team1: toPlayers(1), team2: toPlayers(2) };
  });

  const roster: RosterPlayer[] = (signups ?? []).map((s) => ({
    id: s.id,
    name: signupName(s.profiles?.full_name, s.guest_name),
    checkedIn: !!s.checked_in_at,
    playing: playing.has(s.id),
  }));

  const queuePlayers: BoardPlayer[] = queueRows.map((q) => ({ signupId: q.signup_id, name: q.name }));

  const now = Date.now();
  const startsAt = new Date(session.starts_at).getTime();
  const endsAt = new Date(session.ends_at).getTime();
  const isLive = session.status === "published" && now >= startsAt && now <= endsAt;
  const notLiveReason =
    session.status !== "published"
      ? `This session is ${session.status}. Publish it from the admin screen to run rotation.`
      : now < startsAt
        ? "This session hasn't started yet."
        : now > endsAt
          ? "This session's time window has ended."
          : null;

  return (
    <RunBoard
      sessionId={id}
      title={session.title}
      isLive={isLive}
      notLiveReason={notLiveReason}
      courts={courts ?? []}
      matches={boardMatches}
      queue={queuePlayers}
      roster={roster}
    />
  );
}
