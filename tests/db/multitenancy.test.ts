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
  expenseId: string;
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
  const expenseId = randomUUID();
  await client.query(
    `insert into expenses (id, venue_id, incurred_on, amount_cents, category, note)
     values ($1, $2, current_date, 300000, 'rent', 'seed')`,
    [expenseId, venueId]
  );
  return { venueId, courtId, adminId, memberId, bookingId, coachId, expenseId };
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

  it("confirm_booking_group confirms a whole cart; only an admin of its venue can", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");

      // Two pending bookings sharing one group at Venue A.
      const gid = randomUUID();
      for (const off of [2, 3]) {
        await client.query(
          `insert into bookings (court_id, booking_group_id, guest_name, guest_phone, time_range, status, party_size, total_cents, payment_status, source)
           values ($1, $2, 'Cart', '0900',
             tstzrange(now() + ($3 || ' day')::interval, now() + ($3 || ' day')::interval + interval '1 hour', '[)'),
             'pending', 1, 50000, 'pay_at_venue', 'online')`,
          [a.courtId, gid, String(off)]
        );
      }

      // An admin of B cannot confirm A's group.
      await actAs(client, b.adminId);
      await client.query(`savepoint sp`);
      await expect(client.query(`select confirm_booking_group($1)`, [gid])).rejects.toThrow(/NOT_AUTHORIZED/);
      await client.query(`rollback to savepoint sp`);

      // An admin of A confirms both slots at once.
      await asSuperuser(client);
      await actAs(client, a.adminId);
      const { rows } = await client.query(`select status from confirm_booking_group($1)`, [gid]);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.status === "confirmed")).toBe(true);
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

  it("an admin sees only their own venue's expenses", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");

      await actAs(client, a.adminId);
      const { rows } = await client.query(`select id, venue_id from expenses`);
      expect(rows.every((r) => r.venue_id === a.venueId)).toBe(true);
      expect(rows.map((r) => r.id)).toContain(a.expenseId);
      expect(rows.map((r) => r.id)).not.toContain(b.expenseId);
    });
  });

  it("an admin cannot read, update, or delete another venue's expense", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");

      await actAs(client, a.adminId);
      // B's expense is invisible to A — a targeted select returns nothing…
      const read = await client.query(`select id from expenses where id = $1`, [b.expenseId]);
      expect(read.rowCount).toBe(0);
      // …and update/delete affect zero rows (RLS hides it entirely).
      const upd = await client.query(`update expenses set amount_cents = 1 where id = $1`, [b.expenseId]);
      expect(upd.rowCount).toBe(0);
      const del = await client.query(`delete from expenses where id = $1`, [b.expenseId]);
      expect(del.rowCount).toBe(0);
    });
  });

  it("an admin cannot log an expense against another venue (RLS with check)", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");

      await actAs(client, a.adminId);
      // Own venue: allowed.
      const own = await client.query(
        `insert into expenses (venue_id, incurred_on, amount_cents, category) values ($1, current_date, 5000, 'utilities') returning id`,
        [a.venueId]
      );
      expect(own.rowCount).toBe(1);
      // Another venue: the with-check policy rejects it.
      await client.query(`savepoint sp_ins`);
      await expect(
        client.query(
          `insert into expenses (venue_id, incurred_on, amount_cents, category) values ($1, current_date, 5000, 'utilities')`,
          [b.venueId]
        )
      ).rejects.toThrow(/row-level security/);
      await client.query(`rollback to savepoint sp_ins`);
    });
  });

  it("a non-admin member cannot read or write any expenses", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");

      await actAs(client, a.memberId);
      // No read access even to their own venue's expenses (financials are admin-only).
      const read = await client.query(`select id from expenses`);
      expect(read.rowCount).toBe(0);
      // And they cannot insert one for their own venue.
      await client.query(`savepoint sp_member`);
      await expect(
        client.query(
          `insert into expenses (venue_id, incurred_on, amount_cents, category) values ($1, current_date, 5000, 'other')`,
          [a.venueId]
        )
      ).rejects.toThrow(/row-level security/);
      await client.query(`rollback to savepoint sp_member`);
    });
  });

  // Front-desk staff: can run booking/payment ops for their own venue, but nothing admin-only.
  async function seedFrontDesk(client: PoolClient, venueId: string): Promise<string> {
    const fd = await createMemberProfile(client);
    await client.query(`update profiles set role = 'player', venue_id = null where id = $1`, [fd]);
    await client.query(
      `insert into venue_memberships (profile_id, venue_id, role) values ($1, $2, 'front_desk')
       on conflict (profile_id, venue_id) do update set role = 'front_desk'`,
      [fd, venueId]
    );
    return fd;
  }

  it("a front-desk member can confirm and cancel their own venue's bookings", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const fd = await seedFrontDesk(client, a.venueId);

      const pendingId = randomUUID();
      await client.query(
        `insert into bookings (id, court_id, guest_name, guest_phone, time_range, status, party_size, total_cents, payment_status, source)
         values ($1, $2, 'Guest', '09170000000', tstzrange(now() + interval '2 day', now() + interval '2 day 1 hour', '[)'), 'pending', 1, 50000, 'awaiting_verification', 'online')`,
        [pendingId, a.courtId]
      );

      await actAs(client, fd);
      // Reads their venue's bookings (RLS select via staff).
      const list = await client.query(`select id from bookings where id = $1`, [pendingId]);
      expect(list.rowCount).toBe(1);
      // Confirms and then cancels via the RPCs (staff-guarded).
      const conf = await client.query(`select status from confirm_booking(p_booking_id => $1)`, [pendingId]);
      expect(conf.rows[0].status).toBe("confirmed");
      const canc = await client.query(`select status from cancel_booking(p_booking_id => $1)`, [pendingId]);
      expect(canc.rows[0].status).toBe("cancelled");
    });
  });

  it("a front-desk member of A cannot act on B's booking or read B's bookings", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const b = await seedTenant(client, "Venue B");
      const fd = await seedFrontDesk(client, a.venueId);

      await actAs(client, fd);
      const read = await client.query(`select id from bookings where id = $1`, [b.bookingId]);
      expect(read.rowCount).toBe(0); // B's booking is invisible
      await client.query(`savepoint sp_fd`);
      await expect(client.query(`select cancel_booking(p_booking_id => $1)`, [b.bookingId])).rejects.toThrow(
        /NOT_AUTHORIZED/
      );
      await client.query(`rollback to savepoint sp_fd`);
    });
  });

  it("a front-desk member cannot read expenses or change venue settings (admin-only)", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const fd = await seedFrontDesk(client, a.venueId);

      await actAs(client, fd);
      // Expenses are admin-only — invisible to front desk.
      const exp = await client.query(`select id from expenses`);
      expect(exp.rowCount).toBe(0);
      // Cannot edit the venue's courts (admin-write RLS).
      const upd = await client.query(`update courts set name = 'hacked' where id = $1`, [a.courtId]);
      expect(upd.rowCount).toBe(0);
    });
  });

  it("a venue admin can set a member to front_desk, but never to admin", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");

      await actAs(client, a.adminId);
      const set = await client.query(`select set_membership_role($1, $2, 'front_desk') as role`, [a.venueId, a.memberId]);
      expect(set.rows[0].role).toBe("front_desk");
      // Cannot grant admin via this RPC.
      await client.query(`savepoint sp_role`);
      await expect(client.query(`select set_membership_role($1, $2, 'admin')`, [a.venueId, a.memberId])).rejects.toThrow(
        /INVALID_ROLE/
      );
      await client.query(`rollback to savepoint sp_role`);
    });
  });

  it("a front-desk member cannot assign roles (not an admin)", async () => {
    await withRollback(async (client) => {
      const a = await seedTenant(client, "Venue A");
      const fd = await seedFrontDesk(client, a.venueId);

      await actAs(client, fd);
      await expect(
        client.query(`select set_membership_role($1, $2, 'front_desk')`, [a.venueId, a.memberId])
      ).rejects.toThrow(/NOT_AUTHORIZED/);
    });
  });
});
