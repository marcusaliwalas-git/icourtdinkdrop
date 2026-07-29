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
    durationMinutes: z
      .number()
      .int()
      .min(30)
      .max(240)
      .multipleOf(30),
    partySize: z.number().int().min(1).max(20).default(1),
    guestName: z.string().trim().min(1).max(120).optional(),
    guestPhone: phSchema.optional(),
    notes: z.string().trim().max(500).optional(),
    playerNames: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .refine((data) => !!data.guestName === !!data.guestPhone, {
    message: "guestName and guestPhone must be provided together",
    path: ["guestPhone"],
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

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
