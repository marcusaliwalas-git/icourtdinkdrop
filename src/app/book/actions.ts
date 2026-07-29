"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createBookingSchema, cancelBookingSchema } from "@/lib/validation/booking";
import { mapBookingError } from "@/lib/booking-errors";
import { parseTstzRange } from "@/lib/availability";
import {
  sendBookingConfirmationEmail,
  sendBookingCancellationEmail,
  buildWhatsAppShareLink,
} from "@/lib/email";

export type CreateBookingResult =
  | { success: true; bookingId: string; referenceCode: string; whatsAppShareLink: string }
  | { success: false; code: string; message: string };

export async function createBooking(input: unknown): Promise<CreateBookingResult> {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const {
    courtId,
    startsAt,
    durationMinutes,
    partySize,
    guestName,
    guestPhone,
    notes,
    playerNames,
    idempotencyKey,
  } = parsed.data;

  const { data, error } = await supabase.rpc("create_booking", {
    p_court_id: courtId,
    p_starts_at: startsAt,
    p_duration_minutes: durationMinutes,
    p_party_size: partySize,
    p_booked_by: user?.id ?? null,
    p_guest_name: user ? null : guestName ?? null,
    p_guest_phone: user ? null : guestPhone ?? null,
    p_source: "online",
    p_notes: notes ?? null,
    p_idempotency_key: idempotencyKey ?? null,
    p_player_names: playerNames ?? [],
  });

  if (error) {
    const mapped = mapBookingError(error);
    return { success: false, ...mapped };
  }

  const { data: court } = await supabase
    .from("courts")
    .select("name, venues(timezone)")
    .eq("id", courtId)
    .single();
  const timezone = (court?.venues as unknown as { timezone: string } | null)?.timezone ?? "Asia/Manila";
  const { start, end } = parseTstzRange(data.time_range);

  if (user?.email) {
    await sendBookingConfirmationEmail({
      to: user.email,
      courtName: court?.name ?? "Court",
      startsAt: start,
      endsAt: end,
      timezone,
      referenceCode: data.reference_code,
      totalCents: data.total_cents,
    });
  }

  const whatsAppShareLink = buildWhatsAppShareLink({
    courtName: court?.name ?? "Court",
    startsAt: start,
    endsAt: end,
    timezone,
    referenceCode: data.reference_code,
  });

  revalidatePath("/book");
  revalidatePath("/bookings");
  return { success: true, bookingId: data.id, referenceCode: data.reference_code, whatsAppShareLink };
}

export type CancelBookingResult = { success: true } | { success: false; code: string; message: string };

export async function cancelBooking(input: unknown): Promise<CancelBookingResult> {
  const parsed = cancelBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("cancel_booking", {
    p_booking_id: parsed.data.bookingId,
    p_reference_code: parsed.data.referenceCode ?? null,
  });

  if (error) {
    const mapped = mapBookingError(error);
    return { success: false, ...mapped };
  }

  if (user?.email) {
    const { data: court } = await supabase
      .from("courts")
      .select("name, venues(timezone)")
      .eq("id", data.court_id)
      .single();
    const timezone = (court?.venues as unknown as { timezone: string } | null)?.timezone ?? "Asia/Manila";
    const { start, end } = parseTstzRange(data.time_range);
    await sendBookingCancellationEmail({
      to: user.email,
      courtName: court?.name ?? "Court",
      startsAt: start,
      endsAt: end,
      timezone,
      referenceCode: data.reference_code,
    });
  }

  revalidatePath("/book");
  revalidatePath("/bookings");
  return { success: true };
}
