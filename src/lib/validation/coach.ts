import { z } from "zod";

const phSchema = z
  .string()
  .trim()
  .regex(/^(\+63|0)9\d{9}$/, "Enter a valid PH mobile number, e.g. 09171234567");

export const coachSchema = z.object({
  venueId: z.uuid(),
  name: z.string().trim().min(1, "Enter the coach's name.").max(120),
  bio: z.string().trim().max(2000).optional(),
  photoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  hourlyRateCents: z.number().int().min(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export type CoachInput = z.infer<typeof coachSchema>;

// A standalone "request a coach" from the public site — admin confirms manually.
export const coachRequestSchema = z
  .object({
    coachId: z.uuid(),
    guestName: z.string().trim().min(1).max(120).optional(),
    guestPhone: phSchema.optional(),
    guestEmail: z.email().optional().or(z.literal("")),
    // Wall-clock "yyyy-MM-ddTHH:mm" from a datetime-local input; resolved to the venue tz server-side.
    preferredAtLocal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .optional()
      .or(z.literal("")),
    message: z.string().trim().max(1000).optional(),
  })
  .refine((d) => !!d.guestName === !!d.guestPhone, {
    message: "Enter both your name and mobile number.",
    path: ["guestPhone"],
  });

export type CoachRequestInput = z.infer<typeof coachRequestSchema>;
