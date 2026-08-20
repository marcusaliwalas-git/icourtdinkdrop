import { describe, it, expect, afterAll } from "vitest";
import type { PoolClient } from "pg";
import { withRollback, closePool } from "../support/db";
import { createVenueWithCourt, createMemberProfile, createAdminProfile, actAsAdmin } from "../support/fixtures";

// Challenge-court rotation lives in the database (SECURITY DEFINER functions gated on
// "admin OR this session's host"), so it's exercised here against a real local Postgres,
// each test inside a rolled-back transaction. See migration 20260816140737.

async function createSession(
  client: PoolClient,
  opts: { venueId: string; courtIds: string[]; hostId: string; status?: string; startsAt?: string; endsAt?: string }
): Promise<string> {
  const { rows } = await client.query(
    `insert into sessions (venue_id, title, starts_at, ends_at, format, capacity, courts_used, host_id, status)
     values ($1, 'Open Play', now() + $2::interval, now() + $3::interval, 'challenge_court', 16, $4::uuid[], $5, $6)
     returning id`,
    [opts.venueId, opts.startsAt ?? "-1 hours", opts.endsAt ?? "3 hours", opts.courtIds, opts.hostId, opts.status ?? "published"]
  );
  return rows[0].id;
}

async function addSignup(client: PoolClient, sessionId: string, name: string, checkedIn = true): Promise<string> {
  const { rows } = await client.query(
    `insert into session_signups (session_id, guest_name, status, checked_in_at)
     values ($1, $2, 'confirmed', case when $3 then now() else null end)
     returning id`,
    [sessionId, name, checkedIn]
  );
  return rows[0].id;
}

async function startMatch(client: PoolClient, sessionId: string, courtId: string, team1: string[], team2: string[]) {
  const { rows } = await client.query(
    `select * from session_start_match(p_session_id => $1, p_court_id => $2, p_team1 => $3::uuid[], p_team2 => $4::uuid[])`,
    [sessionId, courtId, team1, team2]
  );
  return rows[0];
}

async function queue(client: PoolClient, sessionId: string): Promise<{ signup_id: string; name: string }[]> {
  const { rows } = await client.query(`select * from session_queue($1)`, [sessionId]);
  return rows;
}

describe("challenge-court rotation", () => {
  afterAll(closePool);

  it("lets the assigned host seat a doubles match, taking those players out of the queue", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });
      const [a, b, c, d, e] = await Promise.all([
        addSignup(client, sessionId, "A"),
        addSignup(client, sessionId, "B"),
        addSignup(client, sessionId, "C"),
        addSignup(client, sessionId, "D"),
        addSignup(client, sessionId, "E"),
      ]);

      await actAsAdmin(client, hostId); // act as the session's host
      const match = await startMatch(client, sessionId, courtId, [a, b], [c, d]);
      expect(match.session_id).toBe(sessionId);
      expect(match.ended_at).toBeNull();

      const q = await queue(client, sessionId);
      expect(q.map((r) => r.signup_id)).toEqual([e]); // only the un-seated player is up next
    });
  });

  it("rotates players back into the queue when the match ends, after the never-played", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });
      const [a, b, c, d, e] = await Promise.all([
        addSignup(client, sessionId, "A"),
        addSignup(client, sessionId, "B"),
        addSignup(client, sessionId, "C"),
        addSignup(client, sessionId, "D"),
        addSignup(client, sessionId, "E"),
      ]);

      // Postgres freezes now() per transaction, so give the never-played player a distinctly
      // earlier check-in — otherwise their wait time and the just-played players' rotation
      // stamp would be the same instant and ordering couldn't be observed inside one tx.
      await client.query(`update session_signups set checked_in_at = now() - interval '30 minutes' where id = $1`, [e]);

      await actAsAdmin(client, hostId);
      const match = await startMatch(client, sessionId, courtId, [a, b], [c, d]);
      await client.query(`select * from session_end_match(p_match_id => $1, p_winning_team => 1::smallint)`, [match.id]);

      const q = await queue(client, sessionId);
      // All five are back in the queue; the never-played E is up first, the four who just
      // played rotate behind.
      expect(new Set(q.map((r) => r.signup_id))).toEqual(new Set([a, b, c, d, e]));
      expect(q[0].signup_id).toBe(e);

      // The rotation stamped exactly the four who played.
      const { rows } = await client.query(
        `select id from session_signups where session_id = $1 and last_played_at is not null`,
        [sessionId]
      );
      expect(new Set(rows.map((r) => r.id))).toEqual(new Set([a, b, c, d]));
    });
  });

  it("also lets an admin (not the host) run the queue", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const adminId = await createAdminProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });
      const [a, b] = await Promise.all([addSignup(client, sessionId, "A"), addSignup(client, sessionId, "B")]);

      await actAsAdmin(client, adminId);
      const match = await startMatch(client, sessionId, courtId, [a], [b]); // singles
      expect(match.court_id).toBe(courtId);
    });
  });

  it("rejects a caller who is neither admin nor the session host", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const strangerId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });
      const [a, b] = await Promise.all([addSignup(client, sessionId, "A"), addSignup(client, sessionId, "B")]);

      await actAsAdmin(client, strangerId);
      await expect(startMatch(client, sessionId, courtId, [a], [b])).rejects.toThrow(/NOT_AUTHORIZED/);
    });
  });

  it("rejects a court the session isn't using", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      // A second court on the same venue, not listed in courts_used.
      const { rows: courtRows } = await client.query(
        `insert into courts (venue_id, name, hourly_rate_cents, is_active) values ($1, 'Court 2', 50000, true) returning id`,
        [venueId]
      );
      const otherCourt = courtRows[0].id;
      const hostId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });
      const [a, b] = await Promise.all([addSignup(client, sessionId, "A"), addSignup(client, sessionId, "B")]);

      await actAsAdmin(client, hostId);
      await expect(startMatch(client, sessionId, otherCourt, [a], [b])).rejects.toThrow(/COURT_NOT_IN_SESSION/);
    });
  });

  it("rejects starting a second match on a court that's already in use", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });
      const [a, b, c, d] = await Promise.all([
        addSignup(client, sessionId, "A"),
        addSignup(client, sessionId, "B"),
        addSignup(client, sessionId, "C"),
        addSignup(client, sessionId, "D"),
      ]);

      await actAsAdmin(client, hostId);
      await startMatch(client, sessionId, courtId, [a], [b]);
      await expect(startMatch(client, sessionId, courtId, [c], [d])).rejects.toThrow(/COURT_IN_USE/);
    });
  });

  it("rejects seating a player who is already on another court", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const { rows: courtRows } = await client.query(
        `insert into courts (venue_id, name, hourly_rate_cents, is_active) values ($1, 'Court 2', 50000, true) returning id`,
        [venueId]
      );
      const court2 = courtRows[0].id;
      const hostId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId, court2], hostId });
      const [a, b, c] = await Promise.all([
        addSignup(client, sessionId, "A"),
        addSignup(client, sessionId, "B"),
        addSignup(client, sessionId, "C"),
      ]);

      await actAsAdmin(client, hostId);
      await startMatch(client, sessionId, courtId, [a], [b]);
      // 'a' is still on court 1 — can't also be seated on court 2.
      await expect(startMatch(client, sessionId, court2, [a], [c])).rejects.toThrow(/PLAYER_ALREADY_PLAYING/);
    });
  });

  it("rejects a player who hasn't checked in", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });
      const a = await addSignup(client, sessionId, "A", true);
      const notCheckedIn = await addSignup(client, sessionId, "B", false);

      await actAsAdmin(client, hostId);
      await expect(startMatch(client, sessionId, courtId, [a], [notCheckedIn])).rejects.toThrow(/PLAYER_NOT_ELIGIBLE/);
    });
  });

  it("rejects uneven or wrong-sized teams", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });
      const [a, b, c] = await Promise.all([
        addSignup(client, sessionId, "A"),
        addSignup(client, sessionId, "B"),
        addSignup(client, sessionId, "C"),
      ]);

      await actAsAdmin(client, hostId);
      await expect(startMatch(client, sessionId, courtId, [a, b], [c])).rejects.toThrow(/INVALID_MATCH_SIZE/);
    });
  });

  it("rejects running a session that isn't live", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId, status: "draft" });
      const [a, b] = await Promise.all([addSignup(client, sessionId, "A"), addSignup(client, sessionId, "B")]);

      await actAsAdmin(client, hostId);
      await expect(startMatch(client, sessionId, courtId, [a], [b])).rejects.toThrow(/SESSION_NOT_LIVE/);
    });
  });
});
