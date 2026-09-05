"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createBookingSchema, createBookingsSchema, cancelBookingSchema } from "@/lib/validation/booking";
import { mapBookingError } from "@/lib/booking-errors";
import { parseTstzRange } from "@/lib/availability";
import {
  sendBookingConfirmationEmail,
  sendBookingPendingEmail,
  sendBookingCancellationEmail,
  sendAdminBookingRequestEmail,
  sendBookingsPendingEmail,
  sendAdminBookingsRequestEmail,
  buildWhatsAppShareLink,
  buildWhatsAppShareLinkForBookings,
  type BookingLineItem,
} from "@/lib/email";
import { getAdminEmails } from "@/lib/admin-recipients";
import { getTenant } from "@/lib/tenant";
import { tenantEmailBrand } from "@/lib/site-url";
import type { Database } from "@/lib/supabase/database.types";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

export type CreateBookingResult =
  | { success: true; bookingId: string; referenceCode: string; status: string; whatsAppShareLink: string }
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
    guestEmail,
    notes,
    playerNames,
    idempotencyKey,
    paymentReference,
    paymentSlipPath,
  } = parsed.data;

  const { data, error } = await supabase.rpc("create_booking", {
    p_court_id: courtId,
    p_starts_at: startsAt,
    p_duration_minutes: durationMinutes,
    p_party_size: partySize,
    p_booked_by: user?.id ?? null,
    p_guest_name: user ? null : guestName ?? null,
    p_guest_phone: user ? null : guestPhone || null,
    p_guest_email: user ? null : guestEmail || null,
    p_source: "online",
    p_notes: notes ?? null,
    p_idempotency_key: idempotencyKey ?? null,
    p_player_names: playerNames ?? [],
    p_payment_reference: paymentReference ?? null,
    p_payment_slip_path: paymentSlipPath ?? null,
  });

  if (error) {
    const mapped = mapBookingError(error);
    return { success: false, ...mapped };
  }

  const { data: court } = await supabase
    .from("courts")
    .select("name, venue_id, venues(timezone)")
    .eq("id", courtId)
    .single();
  const timezone = (court?.venues as unknown as { timezone: string } | null)?.timezone ?? "Asia/Manila";
  const { start, end } = parseTstzRange(data.time_range);

  // Tenant-scoped: the link in the email points at this venue's own host, and only this venue's
  // admins are notified.
  const tenant = await getTenant();
  const brand = tenantEmailBrand(tenant);
  const venueId = tenant?.id ?? court?.venue_id ?? null;

  // Members always have an email; guests only get one if they chose to give it (it's optional
  // on the guest form — see lib/validation/booking.ts).
  const recipientEmail = user?.email ?? data.guest_email;
  if (recipientEmail) {
    const emailDetails = {
      to: recipientEmail,
      courtName: court?.name ?? "Court",
      startsAt: start,
      endsAt: end,
      timezone,
      referenceCode: data.reference_code,
      totalCents: data.total_cents,
      ...brand,
    };
    // Online bookings start 'pending'; only walk-in/admin-created bookings come back
    // already 'confirmed'.
    if (data.status === "pending") {
      await sendBookingPendingEmail(emailDetails);
    } else {
      await sendBookingConfirmationEmail(emailDetails);
    }
  }

  // Notify admins of a new booking awaiting review. Only online bookings are ever 'pending'
  // (walk-ins are admin-created and auto-confirmed), so this is exactly the set of bookings
  // that needs a human to verify payment. Sent regardless of whether the booker gave an email.
  if (data.status === "pending" && venueId) {
    const adminEmails = await getAdminEmails(venueId);
    await Promise.all(
      adminEmails.map((adminEmail) =>
        sendAdminBookingRequestEmail({
          to: adminEmail,
          courtName: court?.name ?? "Court",
          startsAt: start,
          endsAt: end,
          timezone,
          referenceCode: data.reference_code,
          totalCents: data.total_cents,
          bookerName: data.guest_name ?? user?.email ?? "A member",
          bookerContact: data.guest_phone ?? user?.email ?? "—",
          paymentReference: data.payment_reference,
          ...brand,
        })
      )
    );
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
  return {
    success: true,
    bookingId: data.id,
    referenceCode: data.reference_code,
    status: data.status,
    whatsAppShareLink,
  };
}

export type CreatedBooking = {
  bookingId: string;
  referenceCode: string;
  status: string;
  courtName: string;
  startsAtIso: string;
  endsAtIso: string;
};

export type CreateBookingsResult =
  | { success: true; bookings: CreatedBooking[]; totalCents: number; status: string; whatsAppShareLink: string }
  | { success: false; code: string; message: string };

/**
 * Create a cart of bookings (multiple courts and/or non-contiguous time slots on one day) in a
 * single atomic call. All-or-nothing: if any slot fails or was just taken, nothing is booked.
 * Sends one combined email to the booker and one to the admins, rather than one per slot.
 */
export async function createBookings(input: unknown): Promise<CreateBookingsResult> {
  const parsed = createBookingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const {
    segments,
    coachId,
    partySize,
    guestName,
    guestPhone,
    guestEmail,
    notes,
    idempotencyKey,
    paymentReference,
    paymentSlipPath,
  } = parsed.data;

  const { data, error } = await supabase.rpc("create_bookings", {
    p_segments: segments.map((s) => ({
      court_id: s.courtId,
      starts_at: s.startsAt,
      duration_minutes: s.durationMinutes,
    })),
    p_party_size: partySize,
    p_booked_by: user?.id ?? null,
    p_guest_name: user ? null : guestName ?? null,
    p_guest_phone: user ? null : guestPhone || null,
    p_guest_email: user ? null : guestEmail || null,
    p_source: "online",
    p_notes: notes ?? null,
    p_idempotency_key: idempotencyKey ?? null,
    p_player_names: [],
    p_payment_reference: paymentReference ?? null,
    p_payment_slip_path: paymentSlipPath ?? null,
    p_coach_id: coachId ?? null,
  });

  if (error) {
    // Log the real Postgres/PostgREST error server-side — the user only sees a friendly
    // message, so without this a missing migration (PGRST202 "function not found") or any
    // other RPC failure is invisible in the logs. A common cause here is the
    // create_bookings migration not being applied to this environment's database.
    console.error("create_bookings RPC failed:", error);
    return { success: false, ...mapBookingError(error) };
  }

  const created = (data ?? []) as unknown as BookingRow[];
  if (created.length === 0) {
    console.error("create_bookings returned no rows for segments:", segments);
    return { success: false, code: "UNKNOWN", message: "Something went wrong. Please try again." };
  }

  // Court names + venue timezone for the combined emails and share link.
  const courtIds = Array.from(new Set(created.map((b) => b.court_id)));
  const { data: courtRows } = await supabase
    .from("courts")
    .select("id, name, venue_id, venues(timezone)")
    .in("id", courtIds);
  const courtNameById = new Map((courtRows ?? []).map((c) => [c.id, c.name]));
  const timezone =
    ((courtRows ?? [])[0]?.venues as unknown as { timezone: string } | null)?.timezone ?? "Asia/Manila";

  // Tenant-scoped links + admin recipients (all cart courts belong to the one tenant).
  const tenant = await getTenant();
  const brand = tenantEmailBrand(tenant);
  const venueId = tenant?.id ?? (courtRows ?? [])[0]?.venue_id ?? null;

  const lineItems: BookingLineItem[] = created.map((b) => {
    const { start, end } = parseTstzRange(b.time_range as string);
    return {
      courtName: courtNameById.get(b.court_id) ?? "Court",
      startsAt: start,
      endsAt: end,
      referenceCode: b.reference_code,
    };
  });
  const totalCents = created.reduce((sum, b) => sum + b.total_cents, 0);
  const status = created[0].status;

  // One combined email to the booker (members always have an email; guests only if they gave one).
  const recipientEmail = user?.email ?? created[0].guest_email;
  if (recipientEmail && status === "pending") {
    await sendBookingsPendingEmail({ to: recipientEmail, timezone, bookings: lineItems, totalCents, ...brand });
  }

  // One combined admin notification (online carts are always 'pending').
  if (status === "pending" && venueId) {
    const adminEmails = await getAdminEmails(venueId);
    await Promise.all(
      adminEmails.map((adminEmail) =>
        sendAdminBookingsRequestEmail({
          to: adminEmail,
          timezone,
          bookings: lineItems,
          totalCents,
          bookerName: created[0].guest_name ?? user?.email ?? "A member",
          bookerContact: created[0].guest_phone ?? user?.email ?? "—",
          paymentReference: created[0].payment_reference,
          ...brand,
        })
      )
    );
  }

  revalidatePath("/book");
  revalidatePath("/bookings");
  return {
    success: true,
    bookings: created.map((b, i) => ({
      bookingId: b.id,
      referenceCode: b.reference_code,
      status: b.status,
      courtName: lineItems[i].courtName,
      startsAtIso: lineItems[i].startsAt.toISOString(),
      endsAtIso: lineItems[i].endsAt.toISOString(),
    })),
    totalCents,
    status,
    whatsAppShareLink: buildWhatsAppShareLinkForBookings({ timezone, bookings: lineItems }),
  };
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

  const recipientEmail = user?.email ?? data.guest_email;
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
      ...tenantEmailBrand(await getTenant()),
    });
  }

  revalidatePath("/book");
  revalidatePath("/bookings");
  return { success: true };
}
