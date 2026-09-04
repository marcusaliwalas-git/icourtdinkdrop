import { describe, it, expect, afterAll } from "vitest";
import type { PoolClient } from "pg";
import { withRollback, closePool } from "../support/db";
import { createVenueWithCourt, createMemberProfile } from "../support/fixtures";

// create_bookings creates a cart of bookings (multiple courts / non-contiguous times) atomically.
// See migration 20260825000000_create_bookings_batch.

type Segment = { court_id: string; starts_at: string; duration_minutes: number };

// A safe mid-day slot tomorrow (10:00 venue-local), so no booking bumps into midnight or the
// close time, regardless of when the suite runs.
function slot(hourOffset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(2 + hourOffset, 0, 0, 0); // 02:00 UTC == 10:00 Asia/Manila
  return d.toISOString();
}

async function addCourt(client: PoolClient, venueId: string, name: string): Promise<string> {
  const { rows } = await client.query(
    `insert into courts (venue_id, name, hourly_rate_cents, is_active) values ($1, $2, 50000, true) returning id`,
    [venueId, name]
  );
  return rows[0].id;
}

async function createBookings(client: PoolClient, segments: Segment[], bookedBy: string) {
  const { rows } = await client.query(
    `select id, court_id from create_bookings(
        p_segments => $1::jsonb, p_party_size => 2, p_booked_by => $2, p_source => 'walkin')`,
    [JSON.stringify(segments), bookedBy]
  );
  return rows;
}

async function countBookings(client: PoolClient, courtIds: string[]): Promise<number> {
  const { rows } = await client.query(`select count(*)::int as n from bookings where court_id = any($1::uuid[])`, [courtIds]);
  return rows[0].n;
}

describe("create_bookings (batch)", () => {
  afterAll(closePool);

  it("books multiple courts at the same time in one call", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const court2 = await addCourt(client, venueId, "Court 2");
      const member = await createMemberProfile(client);

      const created = await createBookings(
        client,
        [
          { court_id: courtId, starts_at: slot(0), duration_minutes: 60 },
          { court_id: court2, starts_at: slot(0), duration_minutes: 60 },
        ],
        member
      );

      expect(created).toHaveLength(2);
      expect(new Set(created.map((r) => r.court_id))).toEqual(new Set([courtId, court2]));
      expect(await countBookings(client, [courtId, court2])).toBe(2);
    });
  });

  it("stamps one shared booking_group_id across the whole cart", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const court2 = await addCourt(client, venueId, "Court 2");
      const member = await createMemberProfile(client);

      await createBookings(
        client,
        [
          { court_id: courtId, starts_at: slot(0), duration_minutes: 60 },
          { court_id: court2, starts_at: slot(0), duration_minutes: 60 },
        ],
        member
      );

      const { rows } = await client.query(
        `select distinct booking_group_id from bookings where court_id = any($1::uuid[])`,
        [[courtId, court2]]
      );
      expect(rows).toHaveLength(1); // both slots share one group
      expect(rows[0].booking_group_id).not.toBeNull();
    });
  });

  it("books non-contiguous times on the same court as separate bookings", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const member = await createMemberProfile(client);

      // 10:00–11:00 and 13:00–14:00 — a gap between them, so two distinct bookings.
      const created = await createBookings(
        client,
        [
          { court_id: courtId, starts_at: slot(0), duration_minutes: 60 },
          { court_id: courtId, starts_at: slot(3), duration_minutes: 60 },
        ],
        member
      );

      expect(created).toHaveLength(2);
      expect(await countBookings(client, [courtId])).toBe(2);
      void venueId;
    });
  });

  it("is atomic: if one slot conflicts, none of the cart is booked", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const court2 = await addCourt(client, venueId, "Court 2");
      const member = await createMemberProfile(client);

      // Pre-occupy court1 at 10:00 so the second segment in the cart will conflict.
      await createBookings(client, [{ court_id: courtId, starts_at: slot(0), duration_minutes: 60 }], member);
      const before = await countBookings(client, [courtId, court2]);
      expect(before).toBe(1);

      // The failing call errors and aborts the statement; a savepoint lets us recover the outer
      // test transaction and then confirm the batch left nothing behind (statement-atomic).
      await client.query("savepoint before_batch");
      await expect(
        createBookings(
          client,
          [
            { court_id: court2, starts_at: slot(0), duration_minutes: 60 }, // fine on its own
            { court_id: courtId, starts_at: slot(0), duration_minutes: 60 }, // conflicts
          ],
          member
        )
      ).rejects.toThrow();
      await client.query("rollback to savepoint before_batch");

      // The whole batch rolled back — court2 was NOT booked despite being free.
      expect(await countBookings(client, [courtId, court2])).toBe(before);
    });
  });

  it("rejects an empty cart", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const member = await createMemberProfile(client);
      void courtId;
      await expect(createBookings(client, [], member)).rejects.toThrow(/NO_SEGMENTS/);
    });
  });

  it("attaches a coach and adds a per-hour fee across the whole cart", async () => {
    await withRollback(async (client) => {
      const { venueId, courtId } = await createVenueWithCourt(client);
      const court2 = await addCourt(client, venueId, "Court 2");
      const member = await createMemberProfile(client);
      const { rows: coachRows } = await client.query(
        `insert into coaches (venue_id, name, hourly_rate_cents) values ($1, 'Coach Rae', 50000) returning id`,
        [venueId]
      );
      const coachId = coachRows[0].id;

      // Cart = 1h on court1 + 2h on court2 = 3h total → coach fee = ₱500/hr × 3 = ₱1,500.
      const { rows } = await client.query(
        `select id, coach_id, coach_fee_cents from create_bookings(
            p_segments => $1::jsonb, p_party_size => 2, p_booked_by => $2, p_source => 'walkin', p_coach_id => $3)`,
        [
          JSON.stringify([
            { court_id: courtId, starts_at: slot(0), duration_minutes: 60 },
            { court_id: court2, starts_at: slot(0), duration_minutes: 120 },
          ]),
          member,
          coachId,
        ]
      );

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.coach_id === coachId)).toBe(true);
      // Fee lives on exactly one booking, summing to the whole cart's coaching cost.
      const totalCoachFee = rows.reduce((sum, r) => sum + r.coach_fee_cents, 0);
      expect(totalCoachFee).toBe(150000);
    });
  });

  it("rejects an unknown coach", async () => {
    await withRollback(async (client) => {
      const { courtId } = await createVenueWithCourt(client);
      const member = await createMemberProfile(client);
      await expect(
        client.query(
          `select create_bookings(
              p_segments => $1::jsonb, p_party_size => 2, p_booked_by => $2, p_source => 'walkin',
              p_coach_id => gen_random_uuid())`,
          [JSON.stringify([{ court_id: courtId, starts_at: slot(0), duration_minutes: 60 }]), member]
        )
      ).rejects.toThrow(/COACH_NOT_FOUND/);
    });
  });
});
