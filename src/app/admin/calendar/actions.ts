"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createBookingSchema } from "@/lib/validation/booking";
import { mapBookingError } from "@/lib/booking-errors";

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
  return { success: true, referenceCode: "" };
}

export async function adminMarkNoShow(bookingId: string): Promise<WalkInResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("mark_no_show", { p_booking_id: bookingId });
  if (error) {
    const mapped = mapBookingError(error);
    return { success: false, ...mapped };
  }
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/members");
  return { success: true, referenceCode: "" };
}
