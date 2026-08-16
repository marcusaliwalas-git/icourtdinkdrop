"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { startMatch, endMatch, setCheckIn, addSignup, removeSignup, type SessionActionResult } from "@/app/host/actions";

export type BoardPlayer = { signupId: string; name: string };
export type BoardMatch = { id: string; courtId: string; startedAtIso: string; team1: BoardPlayer[]; team2: BoardPlayer[] };
export type RosterPlayer = { id: string; name: string; checkedIn: boolean; playing: boolean };
type Court = { id: string; name: string };

function elapsed(fromIso: string, now: number): string {
  const secs = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RunBoard({
  sessionId,
  title,
  isLive,
  notLiveReason,
  courts,
  matches,
  queue,
  roster,
}: {
  sessionId: string;
  title: string;
  isLive: boolean;
  notLiveReason: string | null;
  courts: Court[];
  matches: BoardMatch[];
  queue: BoardPlayer[];
  roster: RosterPlayer[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [walkIn, setWalkIn] = useState("");

  // A local clock so match timers tick without hitting the server.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Live board: realtime pushes a refresh the instant a match or check-in changes, with a slow
  // interval as a safety net if the realtime socket isn't available.
  useEffect(() => {
    const supabase = createClient();
    const refresh = () => router.refresh();
    const channel = supabase
      .channel(`session-board-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "session_matches", filter: `session_id=eq.${sessionId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "session_signups", filter: `session_id=eq.${sessionId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "session_match_players" }, refresh)
      .subscribe();
    const poll = setInterval(refresh, 12000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [sessionId, router]);

  function run(fn: () => Promise<SessionActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) setError(result.message);
      else router.refresh();
    });
  }

  const matchByCourt = new Map(matches.map((m) => [m.courtId, m]));
  const waiting = roster.filter((r) => !r.checkedIn && !r.playing);
  const checkedInCount = roster.filter((r) => r.checkedIn).length;

  function seat(courtId: string, size: 1 | 2) {
    const need = size * 2;
    const picks = queue.slice(0, need).map((p) => p.signupId);
    if (picks.length < need) return;
    const team1 = picks.slice(0, size);
    const team2 = picks.slice(size, need);
    run(() => startMatch(sessionId, courtId, team1, team2));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {checkedInCount} checked in · {queue.length} in queue · {matches.length} on court
        </p>
      </div>

      {!isLive && notLiveReason && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          {notLiveReason} You can still check players in and build the queue.
        </p>
      )}
      {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {/* Courts */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Courts</h2>
        {courts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No courts assigned to this session.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {courts.map((court) => {
              const match = matchByCourt.get(court.id);
              return (
                <div
                  key={court.id}
                  className={
                    "flex flex-col gap-3 rounded-xl border p-4 " +
                    (match ? "border-primary/50 bg-primary/5" : "border-border/60")
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{court.name}</span>
                    {match ? (
                      <span className="font-mono text-sm tabular-nums text-primary">{elapsed(match.startedAtIso, now)}</span>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground">Open</Badge>
                    )}
                  </div>

                  {match ? (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                        <TeamNames players={match.team1} align="left" />
                        <span className="text-xs text-muted-foreground">vs</span>
                        <TeamNames players={match.team2} align="right" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => endMatch(match.id, 1))}>
                          ◀ Won
                        </Button>
                        <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => endMatch(match.id, 2))}>
                          Won ▶
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">Seat the next players from the queue.</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" disabled={!isLive || isPending || queue.length < 2} onClick={() => seat(court.id, 1)}>
                          Singles
                        </Button>
                        <Button size="sm" disabled={!isLive || isPending || queue.length < 4} onClick={() => seat(court.id, 2)}>
                          Doubles
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Queue */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Up next</h2>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Queue is empty. Check players in to fill it.</p>
          ) : (
            <ol className="flex flex-col gap-1">
              {queue.map((p, i) => (
                <li key={p.signupId} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{(i + 1).toString().padStart(2, "0")}</span>
                  {p.name}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Check-in */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Players</h2>
          <form
            action={(fd) => {
              const value = String(fd.get("name") ?? "").trim();
              if (!value) return;
              run(async () => {
                const r = await addSignup(sessionId, { guestName: value, checkIn: true });
                if (r.success) setWalkIn("");
                return r;
              });
            }}
            className="flex gap-2"
          >
            <Input
              name="name"
              placeholder="Add a walk-in"
              value={walkIn}
              onChange={(e) => setWalkIn(e.target.value)}
              aria-label="Walk-in name"
            />
            <Button type="submit" disabled={isPending || !walkIn.trim()}>
              Add
            </Button>
          </form>

          {waiting.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Waiting to check in</p>
              {waiting.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                  <span>{r.name}</span>
                  <span className="flex items-center gap-1">
                    <Button size="sm" disabled={isPending} onClick={() => run(() => setCheckIn(r.id, true))}>
                      Check in
                    </Button>
                    <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => removeSignup(r.id))}>
                      Remove
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {checkedInCount} checked in of {roster.length} on the roster.
          </p>
        </section>
      </div>
    </div>
  );
}

function TeamNames({ players, align }: { players: BoardPlayer[]; align: "left" | "right" }) {
  return (
    <div className={"flex flex-col gap-0.5 " + (align === "right" ? "text-right" : "text-left")}>
      {players.map((p) => (
        <span key={p.signupId}>{p.name}</span>
      ))}
    </div>
  );
}
