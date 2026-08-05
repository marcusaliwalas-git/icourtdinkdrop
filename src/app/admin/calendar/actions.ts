"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createBookingSchema } from "@/lib/validation/booking";
import { mapBookingError } from "@/lib/booking-errors";
import { parseTstzRange } from "@/lib/availability";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingConfirmationEmail } from "@/lib/email";

export type WalkInResult =
  | { success: true; referenceCode: string }
  | { success: false; code: string; message: string };

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
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) {
    const mapped = mapBookingError(error);
    return { success: false, ...mapped };
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

  if (data.booked_by) {
    const { data: court } = await supabase
      .from("courts")
      .select("name, venues(timezone)")
      .eq("id", data.court_id)
      .single();
    const timezone = (court?.venues as unknown as { timezone: string } | null)?.timezone ?? "Asia/Manila";
    const { start, end } = parseTstzRange(data.time_range);

    // Confirming touches another member's account, which requireAdmin's own session can't
    // read (auth.users isn't exposed to the client) — the service-role admin client can.
    const adminClient = createAdminClient();
    const { data: authUser } = await adminClient.auth.admin.getUserById(data.booked_by);
    if (authUser?.user?.email) {
      await sendBookingConfirmationEmail({
        to: authUser.user.email,
        courtName: court?.name ?? "Court",
        startsAt: start,
        endsAt: end,
        timezone,
        referenceCode: data.reference_code,
        totalCents: data.total_cents,
      });
    }
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
