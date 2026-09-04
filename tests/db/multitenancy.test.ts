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
  await client.query(
    `insert into venue_memberships (profile_id, venue_id, role) values ($1, $2, 'admin')
     on conflict (profile_id, venue_id) do nothing`,
    [adminId, venueId]
  );
  const memberId = await createMemberProfile(client);
  await client.query(`update profiles set venue_id = $1 where id = $2`, [venueId, memberId]);
  await client.query(
    `insert into venue_memberships (profile_id, venue_id, role) values ($1, $2, 'player')
     on conflict (profile_id, venue_id) do nothing`,
    [memberId, venueId]
  );
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

  it("an admin cannot cancel another venue's booking via the RPC", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");

      await actAs(client, a.adminId);
      await expect(client.query(`select cancel_booking(p_booking_id => $1)`, [b.bookingId])).rejects.toThrow(
        /NOT_AUTHORIZED/
      );
    });
  });

  it("an admin cannot reschedule another venue's booking via the RPC", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");

      await actAs(client, a.adminId);
      await expect(
        client.query(
          `select reschedule_booking(p_booking_id => $1, p_new_court_id => $2, p_new_starts_at => now() + interval '2 days')`,
          [b.bookingId, b.courtId]
        )
      ).rejects.toThrow(/NOT_AUTHORIZED/);
    });
  });

  it("an admin can cancel their own venue's booking via the RPC", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");

      await actAs(client, a.adminId);
      const { rows } = await client.query(`select status from cancel_booking(p_booking_id => $1)`, [a.bookingId]);
      expect(rows[0].status).toBe("cancelled");
    });
  });

  it("a venue_memberships-only admin (no legacy profiles.role/venue_id) can confirm a booking", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");

      // An admin whose admin-ness comes *solely* from venue_memberships — profiles.role is not
      // 'admin' and venue_id doesn't point at A (the multi-venue onboarding shape). This is the
      // case the old is_admin()/current_user_venue() RPC guard wrongly rejected.
      const mvAdmin = await createMemberProfile(client);
      await client.query(`update profiles set role = 'player', venue_id = null where id = $1`, [mvAdmin]);
      await client.query(
        `insert into venue_memberships (profile_id, venue_id, role) values ($1, $2, 'admin')`,
        [mvAdmin, a.venueId]
      );

      const pendingId = randomUUID();
      await client.query(
        `insert into bookings (id, court_id, guest_name, guest_phone, time_range, status, party_size, total_cents, payment_status, source)
         values ($1, $2, 'Guest', '09170000000', tstzrange(now() + interval '2 day', now() + interval '2 day 1 hour', '[)'), 'pending', 1, 50000, 'pay_at_venue', 'walkin')`,
        [pendingId, a.courtId]
      );

      await actAs(client, mvAdmin);
      const { rows } = await client.query(`select status from confirm_booking(p_booking_id => $1)`, [pendingId]);
      expect(rows[0].status).toBe("confirmed");
    });
  });

  it("a membership admin of A still cannot confirm B's booking", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");

      // Admin of A via venue_memberships only; must not reach into B.
      const mvAdmin = await createMemberProfile(client);
      await client.query(`update profiles set role = 'player', venue_id = null where id = $1`, [mvAdmin]);
      await client.query(
        `insert into venue_memberships (profile_id, venue_id, role) values ($1, $2, 'admin')`,
        [mvAdmin, a.venueId]
      );

      const pendingB = randomUUID();
      await client.query(
        `insert into bookings (id, court_id, guest_name, guest_phone, time_range, status, party_size, total_cents, payment_status, source)
         values ($1, $2, 'Guest', '09170000000', tstzrange(now() + interval '2 day', now() + interval '2 day 1 hour', '[)'), 'pending', 1, 50000, 'pay_at_venue', 'walkin')`,
        [pendingB, b.courtId]
      );

      await actAs(client, mvAdmin);
      await expect(client.query(`select confirm_booking(p_booking_id => $1)`, [pendingB])).rejects.toThrow(
        /NOT_AUTHORIZED/
      );
    });
  });

  it("only a super admin can change a venue's capability flags", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const superId = await createMemberProfile(client);
      await client.query(`update profiles set is_super_admin = true where id = $1`, [superId]);

      // Super admin turns a capability off via the RPC.
      await actAs(client, superId);
      const { rows } = await client.query(`select set_venue_feature($1, 'coaches', false) as features`, [a.venueId]);
      expect(rows[0].features).toMatchObject({ coaches: false });

      // A venue admin (not super) cannot — not via the RPC… (savepoints because each raise aborts to
      // the savepoint, letting the single transaction continue to the next assertion).
      await asSuperuser(client);
      await actAs(client, a.adminId);
      await client.query(`savepoint sp_rpc`);
      await expect(client.query(`select set_venue_feature($1, 'coaches', true)`, [a.venueId])).rejects.toThrow(
        /NOT_AUTHORIZED/
      );
      await client.query(`rollback to savepoint sp_rpc`);
      // …nor by writing the column directly (the guard trigger blocks it, even though RLS lets the
      // admin update their own venue row).
      await client.query(`savepoint sp_col`);
      await expect(
        client.query(`update venues set features = '{"coaches": true}'::jsonb where id = $1`, [a.venueId])
      ).rejects.toThrow(/NOT_AUTHORIZED/);
      await client.query(`rollback to savepoint sp_col`);
    });
  });

  it("only a super admin can change a venue's theme", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const superId = await createMemberProfile(client);
      await client.query(`update profiles set is_super_admin = true where id = $1`, [superId]);

      // Super admin assigns a theme via the RPC.
      await actAs(client, superId);
      const { rows } = await client.query(`select set_venue_theme($1, 'ocean') as theme`, [a.venueId]);
      expect(rows[0].theme).toBe("ocean");

      // A venue admin cannot — not via the RPC…
      await asSuperuser(client);
      await actAs(client, a.adminId);
      await client.query(`savepoint sp_rpc`);
      await expect(client.query(`select set_venue_theme($1, 'grape')`, [a.venueId])).rejects.toThrow(/NOT_AUTHORIZED/);
      await client.query(`rollback to savepoint sp_rpc`);
      // …nor by writing the column directly (guard trigger).
      await client.query(`savepoint sp_col`);
      await expect(client.query(`update venues set theme = 'grape' where id = $1`, [a.venueId])).rejects.toThrow(
        /NOT_AUTHORIZED/
      );
      await client.query(`rollback to savepoint sp_col`);
    });
  });

  it("audit_log.venue_id is derived from the logged entity by the trigger", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");

      // booking entity → the booking's court's venue
      const booking = await client.query(
        `insert into audit_log (actor_id, action, entity, entity_id) values ($1, 'x', 'booking', $2) returning venue_id`,
        [a.adminId, a.bookingId]
      );
      expect(booking.rows[0].venue_id).toBe(a.venueId);

      // venue entity → the venue id itself
      const venue = await client.query(
        `insert into audit_log (actor_id, action, entity, entity_id) values ($1, 'x', 'venue', $2) returning venue_id`,
        [a.adminId, a.venueId]
      );
      expect(venue.rows[0].venue_id).toBe(a.venueId);

      // an explicit venue_id is respected, not overwritten
      const b = await seedTenant(client, "Venue B");
      const explicit = await client.query(
        `insert into audit_log (actor_id, action, entity, entity_id, venue_id) values ($1, 'x', 'profile', $2, $3) returning venue_id`,
        [a.adminId, a.memberId, b.venueId]
      );
      expect(explicit.rows[0].venue_id).toBe(b.venueId);
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
