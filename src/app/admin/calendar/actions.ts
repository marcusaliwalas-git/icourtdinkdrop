"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createBookingSchema } from "@/lib/validation/booking";
import { mapBookingError } from "@/lib/booking-errors";
import { parseTstzRange } from "@/lib/availability";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendBookingConfirmationEmail,
  sendBookingCancellationEmail,
  sendBookingRescheduledEmail,
} from "@/lib/email";
import type { RatePeriod } from "@/lib/pricing";

function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export type WalkInResult =
  | { success: true; referenceCode: string }
  | { success: false; code: string; message: string };

/** A member's email lives in auth.users, which requireAdmin's own session can't read
 * (only the service-role client can) — a guest's is just the guest_email column on the
 * booking itself. Returns null for a walk-in (no booked_by, no guest_email collected). */
async function resolveBookingRecipientEmail(bookedBy: string | null, guestEmail: string | null): Promise<string | null> {
  if (bookedBy) {
    const adminClient = createAdminClient();
    const { data: authUser } = await adminClient.auth.admin.getUserById(bookedBy);
    return authUser?.user?.email ?? null;
  }
  return guestEmail;
}

export async function createWalkInBooking(input: unknown): Promise<WalkInResult> {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { supabase } = await requireAdmin();
  const { courtId, startsAt, durationMinutes, partySize, guestName, guestPhone, notes } = parsed.data;

  const { data, error } = await supabase.rpc("create_booking", {
    p_court_id: courtId,
    p_starts_at: startsAt,
    p_duration_minutes: durationMinutes,
    p_party_size: partySize,
    p_booked_by: null,
    p_guest_name: guestName ?? null,
    p_guest_phone: guestPhone ?? null,
    p_source: "walkin",
    p_notes: notes ?? null,
  });

  if (error) {
    const mapped = mapBookingError(error);
    return { success: false, ...mapped };
  }

  revalidatePath("/admin/calendar");
  return { success: true, referenceCode: data.reference_code };
}

export async function adminCancelBooking(bookingId: string): Promise<WalkInResult> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) {
    const mapped = mapBookingError(error);
    return { success: false, ...mapped };
  }

  const recipientEmail = await resolveBookingRecipientEmail(data.booked_by, data.guest_email);
  if (recipientEmail) {
    const { data: court } = await supabase
      .from("courts")
      .select("name, venues(timezone)")
      .eq("id", data.court_id)
      .single();
    const timezone = (court?.venues as unknown as { timezone: string } | null)?.timezone ?? "Asia/Manila";
    const { start, end } = parseTstzRange(data.time_range);

    await sendBookingCancellationEmail({
      to: recipientEmail,
      courtName: court?.name ?? "Court",
      startsAt: start,
      endsAt: end,
      timezone,
      referenceCode: data.reference_code,
    });
  }

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/bookings");
  return { success: true, referenceCode: "" };
}

export async function adminConfirmBooking(bookingId: string): Promise<WalkInResult> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("confirm_booking", { p_booking_id: bookingId });
  if (error) {
    const mapped = mapBookingError(error);
    return { success: false, ...mapped };
  }

  const recipientEmail = await resolveBookingRecipientEmail(data.booked_by, data.guest_email);
  if (recipientEmail) {
    const { data: court } = await supabase
      .from("courts")
      .select("name, venues(timezone)")
      .eq("id", data.court_id)
      .single();
    const timezone = (court?.venues as unknown as { timezone: string } | null)?.timezone ?? "Asia/Manila";
    const { start, end } = parseTstzRange(data.time_range);

    await sendBookingConfirmationEmail({
      to: recipientEmail,
      courtName: court?.name ?? "Court",
      startsAt: start,
      endsAt: end,
      timezone,
      referenceCode: data.reference_code,
      totalCents: data.total_cents,
    });
  }

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/bookings");
  revalidatePath("/bookings");
  return { success: true, referenceCode: data.reference_code };
}

export type BookingPaymentProof = {
  paymentReference: string | null;
  slipUrl: string | null;
};

/** Storage has no select policy on the payment-slips bucket at all (see its migration) — a
 * signed URL can only ever be minted server-side with the service-role client, never by a
 * client-side/anon read, so a slip can't be enumerated or guessed even by another admin's
 * browser session. */
export async function getBookingPaymentProof(bookingId: string): Promise<BookingPaymentProof> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("bookings")
    .select("payment_reference, payment_slip_path")
    .eq("id", bookingId)
    .maybeSingle();

  if (!data?.payment_slip_path) {
    return { paymentReference: data?.payment_reference ?? null, slipUrl: null };
  }

  const adminClient = createAdminClient();
  const { data: signed } = await adminClient.storage
    .from("payment-slips")
    .createSignedUrl(data.payment_slip_path, 60 * 10);

  return { paymentReference: data.payment_reference, slipUrl: signed?.signedUrl ?? null };
}

export interface RescheduleContext {
  bookingId: string;
  courtId: string;
  courtName: string;
  timezone: string;
  durationMinutes: number;
  currentTotalCents: number;
  currentStartIso: string;
  maxAdvanceDays: number;
  isMember: boolean;
  baseHourlyRateCents: number;
  baseMemberRateCents: number | null;
  ratePeriods: RatePeriod[];
  // Operating window per weekday (0=Sun), in minutes-from-midnight, so the client can list the
  // valid whole-hour start times for any chosen date without another round-trip.
  operatingHours: { dayOfWeek: number; openMinutes: number; closeMinutes: number }[];
}

/** Everything the reschedule UI needs to list valid new start times and preview the price
 * (via lib/pricing) live, without a round-trip per slot the admin tries. */
export async function getRescheduleContext(bookingId: string): Promise<RescheduleContext | null> {
  const { supabase } = await requireAdmin();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, court_id, booked_by, total_cents, time_range")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;

  const { data: court } = await supabase
    .from("courts")
    .select("id, name, hourly_rate_cents, member_rate_cents, venue_id, venues(timezone, max_advance_days)")
    .eq("id", booking.court_id)
    .single();
  if (!court) return null;

  const venue = court.venues as unknown as { timezone: string; max_advance_days: number };

  const [{ data: hours }, { data: periods }] = await Promise.all([
    supabase.from("operating_hours").select("day_of_week, open_time, close_time").eq("venue_id", court.venue_id),
    supabase
      .from("court_rate_periods")
      .select("start_time, end_time, hourly_rate_cents, member_rate_cents")
      .eq("court_id", booking.court_id),
  ]);

  // Membership drives which rate the preview should use; check it the same way
  // has_active_membership does, via the service-role client (memberships isn't client-readable).
  let isMember = false;
  if (booking.booked_by) {
    const today = new Date().toISOString().slice(0, 10);
    const adminClient = createAdminClient();
    const { data: membership } = await adminClient
      .from("memberships")
      .select("id")
      .eq("profile_id", booking.booked_by)
      .eq("status", "active")
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
      .limit(1)
      .maybeSingle();
    isMember = !!membership;
  }

  const { start, end } = parseTstzRange(booking.time_range);

  return {
    bookingId: booking.id,
    courtId: court.id,
    courtName: court.name,
    timezone: venue.timezone,
    durationMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
    currentTotalCents: booking.total_cents,
    currentStartIso: start.toISOString(),
    maxAdvanceDays: venue.max_advance_days,
    isMember,
    baseHourlyRateCents: court.hourly_rate_cents,
    baseMemberRateCents: court.member_rate_cents,
    ratePeriods: (periods ?? []).map((p) => ({
      start_time: p.start_time,
      end_time: p.end_time,
      hourly_rate_cents: p.hourly_rate_cents,
      member_rate_cents: p.member_rate_cents,
    })),
    operatingHours: (hours ?? []).map((h) => ({
      dayOfWeek: h.day_of_week,
      openMinutes: hhmmToMinutes(h.open_time),
      closeMinutes: hhmmToMinutes(h.close_time),
    })),
  };
}

export async function adminRescheduleBooking(
  bookingId: string,
  newCourtId: string,
  newStartsAtIso: string
): Promise<WalkInResult> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("reschedule_booking", {
    p_booking_id: bookingId,
    p_new_court_id: newCourtId,
    p_new_starts_at: newStartsAtIso,
  });
  if (error) {
    const mapped = mapBookingError(error);
    return { success: false, ...mapped };
  }

  const recipientEmail = await resolveBookingRecipientEmail(data.booked_by, data.guest_email);
  if (recipientEmail) {
    const { data: court } = await supabase
      .from("courts")
      .select("name, venues(timezone)")
      .eq("id", data.court_id)
      .single();
    const timezone = (court?.venues as unknown as { timezone: string } | null)?.timezone ?? "Asia/Manila";
    const { start, end } = parseTstzRange(data.time_range);

    await sendBookingRescheduledEmail({
      to: recipientEmail,
      courtName: court?.name ?? "Court",
      startsAt: start,
      endsAt: end,
      timezone,
      referenceCode: data.reference_code,
      totalCents: data.total_cents,
    });
  }

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/bookings");
  revalidatePath("/bookings");
  return { success: true, referenceCode: data.reference_code };
}

export async function adminMarkNoShow(bookingId: string): Promise<WalkInResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("mark_no_show", { p_booking_id: bookingId });
  if (error) {
    const mapped = mapBookingError(error);
    return { success: false, ...mapped };
  }
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/members");
  return { success: true, referenceCode: "" };
}
