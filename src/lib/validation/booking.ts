import { z } from "zod";

// Philippine mobile numbers: accept +63 or 0-prefixed, 10 subscriber digits.
const phSchema = z
  .string()
  .trim()
  .regex(/^(\+63|0)9\d{9}$/, "Enter a valid PH mobile number, e.g. 09171234567");

export const createBookingSchema = z
  .object({
    courtId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    // Whole-hour increments, 1-24 hours.
    durationMinutes: z
      .number()
      .int()
      .min(60)
      .max(1440)
      .multipleOf(60),
    partySize: z.number().int().min(1).max(20).default(1),
    guestName: z.string().trim().min(1).max(120).optional(),
    guestPhone: phSchema.optional(),
    // Required for a guest's online booking (enforced in create_booking, not here — this
    // schema is shared with createWalkInBooking, which never collects an email at all, same
    // reasoning as paymentReference/paymentSlipPath below). It's how a guest, who has no
    // account, ever receives their pending/confirmed/cancelled booking emails.
    guestEmail: z.email().optional().or(z.literal("")),
    notes: z.string().trim().max(500).optional(),
    playerNames: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
    // Required for online bookings, not for admin/walk-in — enforced in create_booking rather
    // than here, since this schema is shared with createWalkInBooking (see admin/calendar/actions.ts).
    paymentReference: z.string().trim().min(1).max(100).optional(),
    paymentSlipPath: z.string().trim().min(1).max(300).optional(),
  })
  .refine((data) => !!data.guestName === !!data.guestPhone, {
    message: "guestName and guestPhone must be provided together",
    path: ["guestPhone"],
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// One slot in a multi-booking cart: a court + start time + whole-hour duration. The shared
// fields (party, guest details, payment proof) live on createBookingsSchema, applied to every
// segment. Each segment becomes its own booking via create_bookings (atomically).
export const bookingSegmentSchema = z.object({
  courtId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(60).max(1440).multipleOf(60),
});

export type BookingSegmentInput = z.infer<typeof bookingSegmentSchema>;

export const createBookingsSchema = z
  .object({
    segments: z.array(bookingSegmentSchema).min(1, "Pick at least one slot.").max(24),
    partySize: z.number().int().min(1).max(20).default(1),
    guestName: z.string().trim().min(1).max(120).optional(),
    guestPhone: phSchema.optional(),
    guestEmail: z.email().optional().or(z.literal("")),
    notes: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
    paymentReference: z.string().trim().min(1).max(100).optional(),
    paymentSlipPath: z.string().trim().min(1).max(300).optional(),
  })
  .refine((data) => !!data.guestName === !!data.guestPhone, {
    message: "guestName and guestPhone must be provided together",
    path: ["guestPhone"],
  });

export type CreateBookingsInput = z.infer<typeof createBookingsSchema>;

export const cancelBookingSchema = z.object({
  bookingId: z.uuid(),
  referenceCode: z
    .string()
    .trim()
    .length(8)
    .optional(),
});

export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const availabilityQuerySchema = z.object({
  venueId: z.uuid(),
  date: z.iso.date(),
});

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
