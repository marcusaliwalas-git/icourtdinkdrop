import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";

export interface VenueFixture {
  venueId: string;
  courtId: string;
}

/**
 * Inserts a venue + a single active court + full-day operating hours every day of the week,
 * so tests only need to reason about the rule they're actually exercising (lead time, advance
 * window, closures, ...) rather than accidentally tripping over an unrelated one.
 */
export async function createVenueWithCourt(
  client: PoolClient,
  overrides: {
    hourlyRateCents?: number;
    memberRateCents?: number | null;
    minLeadMinutes?: number;
    maxAdvanceDays?: number;
  } = {}
): Promise<VenueFixture> {
  const venueId = randomUUID();
  const courtId = randomUUID();

  await client.query(
    `insert into venues (id, name, timezone, min_lead_minutes, max_advance_days)
     values ($1, 'Test Venue', 'Asia/Manila', $2, $3)`,
    [venueId, overrides.minLeadMinutes ?? 60, overrides.maxAdvanceDays ?? 14]
  );

  await client.query(
    `insert into courts (id, venue_id, name, hourly_rate_cents, member_rate_cents, is_active)
     values ($1, $2, 'Court 1', $3, $4, true)`,
    [
      courtId,
      venueId,
      overrides.hourlyRateCents ?? 100000,
      overrides.memberRateCents ?? null,
    ]
  );

  for (let day = 0; day <= 6; day++) {
    await client.query(
      `insert into operating_hours (venue_id, day_of_week, open_time, close_time)
       values ($1, $2, '00:00', '23:45')`,
      [venueId, day]
    );
  }

  return { venueId, courtId };
}

/**
 * Inserts a minimal auth.users row plus its profile, so tests can exercise member-rate
 * pricing and membership lookups. Mirrors the columns Supabase's GoTrue schema requires.
 */
export async function createMemberProfile(
  client: PoolClient,
  options: { active?: boolean } = {}
): Promise<string> {
  const profileId = randomUUID();
  const email = `${profileId}@test.dinkdrop.local`;

  await client.query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
     ) values (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       crypt('test-password', gen_salt('bf')), now(), now(), now(), '{}', '{}'
     )`,
    [profileId, email]
  );

  await client.query(
    `insert into memberships (profile_id, tier, starts_on, ends_on, status)
     values ($1, 'standard', current_date - 30, current_date + 30, $2)`,
    [profileId, options.active === false ? "expired" : "active"]
  );

  return profileId;
}

/** Same as createMemberProfile, but promotes the resulting profile to admin. */
export async function createAdminProfile(client: PoolClient): Promise<string> {
  const profileId = await createMemberProfile(client);
  await client.query(`update profiles set role = 'admin' where id = $1`, [profileId]);
  return profileId;
}

/**
 * Makes auth.uid()/auth.role() resolve to the given profile for the rest of the *current*
 * transaction (is_local = true), so admin-gated SECURITY DEFINER functions (confirm_booking,
 * mark_no_show, ...) can be exercised directly over this raw connection. Only safe to call
 * inside withRollback: the setting is transaction-scoped and disappears on rollback, so it
 * can never leak into a later test that reuses the same pooled connection.
 */
export async function actAsAdmin(client: PoolClient, profileId: string): Promise<void> {
  await client.query(
    `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
    [profileId]
  );
}
