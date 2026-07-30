import type { Pool, PoolClient } from "pg";

export interface CreateBookingParams {
  courtId: string;
  startsAt: Date;
  durationMinutes: number;
  partySize?: number;
  bookedBy?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  source?: string;
  notes?: string | null;
  idempotencyKey?: string | null;
  playerNames?: string[];
}

export interface BookingRow {
  id: string;
  court_id: string;
  booked_by: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  reference_code: string;
  time_range: string;
  status: string;
  party_size: number;
  total_cents: number;
  payment_status: string;
  source: string;
  idempotency_key: string | null;
}

export async function callCreateBooking(
  client: Pool | PoolClient,
  params: CreateBookingParams
): Promise<BookingRow> {
  const result = await client.query(
    `select * from create_booking(
       p_court_id => $1,
       p_starts_at => $2,
       p_duration_minutes => $3,
       p_party_size => $4,
       p_booked_by => $5,
       p_guest_name => $6,
       p_guest_phone => $7,
       p_guest_email => $8,
       p_source => $9,
       p_notes => $10,
       p_idempotency_key => $11,
       p_player_names => $12
     )`,
    [
      params.courtId,
      params.startsAt.toISOString(),
      params.durationMinutes,
      params.partySize ?? 1,
      params.bookedBy ?? null,
      params.guestName ?? null,
      params.guestPhone ?? null,
      params.guestEmail ?? null,
      params.source ?? "online",
      params.notes ?? null,
      params.idempotencyKey ?? null,
      params.playerNames ?? [],
    ]
  );
  return result.rows[0] as BookingRow;
}

/** Requires the caller to have already run actAsAdmin(client, adminProfileId) on this connection. */
export async function callConfirmBooking(client: Pool | PoolClient, bookingId: string): Promise<BookingRow> {
  const result = await client.query(`select * from confirm_booking(p_booking_id => $1)`, [bookingId]);
  return result.rows[0] as BookingRow;
}

/** Requires the caller to have already run actAsAdmin(client, adminProfileId) on this connection. */
export async function callMarkNoShow(client: Pool | PoolClient, bookingId: string): Promise<BookingRow> {
  const result = await client.query(`select * from mark_no_show(p_booking_id => $1)`, [bookingId]);
  return result.rows[0] as BookingRow;
}

export async function callCancelBooking(
  client: Pool | PoolClient,
  bookingId: string,
  referenceCode?: string | null
): Promise<BookingRow> {
  const result = await client.query(
    `select * from cancel_booking(p_booking_id => $1, p_reference_code => $2)`,
    [bookingId, referenceCode ?? null]
  );
  return result.rows[0] as BookingRow;
}
