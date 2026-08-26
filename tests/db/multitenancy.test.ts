import { describe, it, expect, afterAll } from "vitest";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { withRollback, closePool } from "../support/db";
import { createMemberProfile } from "../support/fixtures";

// Tenant isolation is enforced by RLS, which the superuser test connection bypasses — so these
// tests drop to the `authenticated` role (via `set local role`) so the policies actually apply,
// exactly as a real end-user request does. See migrations 20260827000000 / 20260827120000.

type Tenant = {
  venueId: string;
  courtId: string;
  adminId: string;
  memberId: string;
  bookingId: string;
  coachId: string;
};

async function seedTenant(client: PoolClient, name: string): Promise<Tenant> {
  const venueId = randomUUID();
  await client.query(`insert into venues (id, name, timezone) values ($1, $2, 'Asia/Manila')`, [venueId, name]);
  const courtId = randomUUID();
  await client.query(
    `insert into courts (id, venue_id, name, hourly_rate_cents, is_active) values ($1, $2, 'Court 1', 50000, true)`,
    [courtId, venueId]
  );
  const adminId = await createMemberProfile(client);
  await client.query(`update profiles set venue_id = $1, role = 'admin' where id = $2`, [venueId, adminId]);
  const memberId = await createMemberProfile(client);
  await client.query(`update profiles set venue_id = $1 where id = $2`, [venueId, memberId]);
  const bookingId = randomUUID();
  await client.query(
    `insert into bookings (id, court_id, guest_name, guest_phone, time_range, status, party_size, total_cents, payment_status, source)
     values ($1, $2, 'Guest', '09171234567', tstzrange(now() + interval '1 day', now() + interval '1 day 1 hour', '[)'), 'confirmed', 1, 50000, 'pay_at_venue', 'walkin')`,
    [bookingId, courtId]
  );
  const coachId = randomUUID();
  await client.query(
    `insert into coaches (id, venue_id, name, hourly_rate_cents, is_active) values ($1, $2, 'Coach', 60000, true)`,
    [coachId, venueId]
  );
  return { venueId, courtId, adminId, memberId, bookingId, coachId };
}

/** Run subsequent statements as the given user under the `authenticated` role (RLS applies). */
async function actAs(client: PoolClient, profileId: string): Promise<void> {
  await client.query(
    `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
    [profileId]
  );
  await client.query(`set local role authenticated`);
}
async function asSuperuser(client: PoolClient): Promise<void> {
  await client.query(`reset role`);
}

describe("multi-tenant isolation (RLS)", () => {
  afterAll(closePool);

  it("an admin sees only their own venue's bookings", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");

      await actAs(client, a.adminId);
      const { rows } = await client.query(`select id from bookings`);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(a.bookingId);
      expect(ids).not.toContain(b.bookingId);
    });
  });

  it("an admin sees only their own venue's members", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");

      await actAs(client, a.adminId);
      const { rows } = await client.query(`select id, venue_id from profiles where role = 'player'`);
      expect(rows.every((r) => r.venue_id === a.venueId)).toBe(true);
      expect(rows.map((r) => r.id)).toContain(a.memberId);
      expect(rows.map((r) => r.id)).not.toContain(b.memberId);
    });
  });

  it("an admin cannot modify another venue's court", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");

      await actAs(client, a.adminId);
      const other = await client.query(`update courts set name = 'hacked' where id = $1`, [b.courtId]);
      expect(other.rowCount).toBe(0); // RLS hides B's court from A entirely
      const own = await client.query(`update courts set name = 'renamed' where id = $1`, [a.courtId]);
      expect(own.rowCount).toBe(1);
    });
  });

  it("an admin cannot modify another venue's coach", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");

      await actAs(client, a.adminId);
      const res = await client.query(`update coaches set name = 'hacked' where id = $1`, [b.coachId]);
      expect(res.rowCount).toBe(0);
    });
  });

  it("a member can only read their own profile, no one else's", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      await seedTenant(client, "Venue B");

      await actAs(client, a.memberId);
      const { rows } = await client.query(`select id from profiles`);
      expect(rows.map((r) => r.id)).toEqual([a.memberId]);
    });
  });

  it("a member cannot move themselves to another tenant", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");

      await actAs(client, a.memberId);
      await client.query(`update profiles set venue_id = $1 where id = $2`, [b.venueId, a.memberId]);
      await asSuperuser(client);
      const { rows } = await client.query(`select venue_id from profiles where id = $1`, [a.memberId]);
      expect(rows[0].venue_id).toBe(a.venueId); // the guard trigger froze it
    });
  });
});
