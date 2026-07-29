import { Pool, type PoolClient } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
  }
  return pool;
}

/**
 * Runs `fn` inside a transaction that is always rolled back, so test fixtures
 * (venues, courts, bookings, ...) never leak between tests or need manual cleanup.
 * Only safe for logic that doesn't need real cross-connection concurrency.
 */
export async function withRollback<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
