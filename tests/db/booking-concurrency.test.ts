import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { getPool, closePool } from "../support/db";
import { callCreateBooking } from "../support/booking";

// This is the non-negotiable test from PRD.md: "fire 20 concurrent requests at the same
// slot and assert exactly one succeeds." It needs *real* concurrent connections/transactions
// (not the rollback-per-test helper used elsewhere) so the exclusion constraint is actually
// exercised under contention rather than serialized through a single session.

describe("create_booking — concurrent conflict handling", () => {
  let venueId: string;
  let courtId: string;
  const connectionPools: Pool[] = [];

  beforeAll(async () => {
    const setupPool = getPool();
    venueId = randomUUID();
    courtId = randomUUID();

    await setupPool.query(
      `insert into venues (id, name, timezone) values ($1, 'Concurrency Test Venue', 'Asia/Manila')`,
      [venueId]
    );
    await setupPool.query(
      `insert into courts (id, venue_id, name, hourly_rate_cents, is_active)
       values ($1, $2, 'Court 1', 100000, true)`,
      [courtId, venueId]
    );
    for (let day = 0; day <= 6; day++) {
      await setupPool.query(
        `insert into operating_hours (venue_id, day_of_week, open_time, close_time)
         values ($1, $2, '00:00', '23:45')`,
        [venueId, day]
      );
    }
  });

  afterAll(async () => {
    const cleanupPool = getPool();
    await cleanupPool.query(`delete from bookings where court_id = $1`, [courtId]);
    await cleanupPool.query(`delete from courts where id = $1`, [courtId]);
    await cleanupPool.query(`delete from venues where id = $1`, [venueId]);
    await Promise.all(connectionPools.map((p) => p.end()));
    await closePool();
  });

  it("lets exactly one of 20 concurrent requests for the same slot succeed", async () => {
    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + 5);
    startsAt.setUTCHours(10, 0, 0, 0);

    const attempts = 20;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_, i) => {
        // Each attempt gets its own connection so the requests are genuinely concurrent
        // instead of serialized on a shared client.
        const pool = new Pool({
          connectionString:
            process.env.TEST_DATABASE_URL ??
            "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
          max: 1,
        });
        connectionPools.push(pool);
        return callCreateBooking(pool, {
          courtId,
          startsAt,
          durationMinutes: 60,
          guestName: `Concurrent ${i}`,
          guestPhone: `+63917000${String(i).padStart(4, "0")}`,
        });
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(attempts - 1);
    for (const failure of failed) {
      expect(failure.reason).toMatchObject({ code: "23P01" });
    }

    // Online bookings start 'pending', not 'confirmed' — either way, exactly one should
    // hold the slot; that's what the exclusion constraint is actually guaranteeing here.
    const { rows } = await getPool().query(
      `select count(*)::int as count from bookings where court_id = $1 and status in ('confirmed', 'pending')`,
      [courtId]
    );
    expect(rows[0].count).toBe(1);
  });
});
