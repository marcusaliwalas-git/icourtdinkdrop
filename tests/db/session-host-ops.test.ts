import { describe, it, expect, afterAll } from "vitest";
import type { PoolClient } from "pg";
import { withRollback, closePool } from "../support/db";
import { createVenueWithCourt, createMemberProfile, actAsAdmin } from "../support/fixtures";

// Host roster operations (add / check-in / remove signups) — SECURITY DEFINER functions gated
// on "admin OR this session's host", exercised against a real local Postgres. See migration
// 20260816160000_session_host_ops.

async function createSession(
  client: PoolClient,
  opts: { venueId: string; courtIds: string[]; hostId: string }
): Promise<string> {
  const { rows } = await client.query(
    `insert into sessions (venue_id, title, starts_at, ends_at, format, capacity, courts_used, host_id, status)
     values ($1, 'Open Play', now() - interval '1 hour', now() + interval '3 hours', 'challenge_court', 16, $2::uuid[], $3, 'published')
     returning id`,
    [opts.venueId, opts.courtIds, opts.hostId]
  );
  return rows[0].id;
}

async function addSignup(client: PoolClient, sessionId: string, name: string): Promise<string> {
  const { rows } = await client.query(
    `select id from session_add_signup(p_session_id => $1, p_guest_name => $2)`,
    [sessionId, name]
  );
  return rows[0].id;
}

async function queueIds(client: PoolClient, sessionId: string): Promise<string[]> {
  const { rows } = await client.query(`select signup_id from session_queue($1)`, [sessionId]);
  return rows.map((r) => r.signup_id);
}

describe("session host ops — roster", () => {
  afterAll(closePool);

  it("lets the host add a walk-in, checked in and in the queue by default", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });

      await actAsAdmin(client, hostId);
      const signupId = await addSignup(client, sessionId, "Walk In");

      expect(await queueIds(client, sessionId)).toEqual([signupId]);
    });
  });

  it("rejects adding a player with no name", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });

      await actAsAdmin(client, hostId);
      await expect(
        client.query(`select session_add_signup(p_session_id => $1, p_guest_name => '  ')`, [sessionId])
      ).rejects.toThrow(/SIGNUP_NAME_REQUIRED/);
    });
  });

  it("rejects a stranger adding a player", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const strangerId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });

      await actAsAdmin(client, strangerId);
      await expect(
        client.query(`select session_add_signup(p_session_id => $1, p_guest_name => 'X')`, [sessionId])
      ).rejects.toThrow(/NOT_AUTHORIZED/);
    });
  });

  it("checking a player out removes them from the queue, checking back in restores them", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });

      await actAsAdmin(client, hostId);
      const a = await addSignup(client, sessionId, "A");
      const b = await addSignup(client, sessionId, "B");
      expect(new Set(await queueIds(client, sessionId))).toEqual(new Set([a, b]));

      await client.query(`select session_set_check_in(p_signup_id => $1, p_checked_in => false)`, [a]);
      expect(await queueIds(client, sessionId)).toEqual([b]);

      await client.query(`select session_set_check_in(p_signup_id => $1, p_checked_in => true)`, [a]);
      expect(new Set(await queueIds(client, sessionId))).toEqual(new Set([a, b]));
    });
  });

  it("rejects a stranger checking someone in", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const strangerId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });
      await actAsAdmin(client, hostId);
      const a = await addSignup(client, sessionId, "A");

      await actAsAdmin(client, strangerId);
      await expect(
        client.query(`select session_set_check_in(p_signup_id => $1, p_checked_in => false)`, [a])
      ).rejects.toThrow(/NOT_AUTHORIZED/);
    });
  });

  it("removes a signup, but not one that's currently on a court", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });

      await actAsAdmin(client, hostId);
      const a = await addSignup(client, sessionId, "A");
      const b = await addSignup(client, sessionId, "B");
      const c = await addSignup(client, sessionId, "C");

      // c is idle — removable.
      await client.query(`select session_remove_signup(p_signup_id => $1)`, [c]);
      expect(new Set(await queueIds(client, sessionId))).toEqual(new Set([a, b]));

      // Seat a vs b, then a can't be removed mid-match.
      await client.query(
        `select session_start_match(p_session_id => $1, p_court_id => $2, p_team1 => $3::uuid[], p_team2 => $4::uuid[])`,
        [sessionId, courtId, [a], [b]]
      );
      await expect(
        client.query(`select session_remove_signup(p_signup_id => $1)`, [a])
      ).rejects.toThrow(/PLAYER_ALREADY_PLAYING/);
    });
  });

  it("rejects a stranger removing a signup", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const hostId = await createMemberProfile(client);
      const strangerId = await createMemberProfile(client);
      const sessionId = await createSession(client, { venueId, courtIds: [courtId], hostId });
      await actAsAdmin(client, hostId);
      const a = await addSignup(client, sessionId, "A");

      await actAsAdmin(client, strangerId);
      await expect(
        client.query(`select session_remove_signup(p_signup_id => $1)`, [a])
      ).rejects.toThrow(/NOT_AUTHORIZED/);
    });
  });
});
