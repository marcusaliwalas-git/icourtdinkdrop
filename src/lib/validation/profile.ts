import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(\+63|0)9\d{9}$/, "Enter a valid PH mobile number, e.g. 09171234567")
    .optional()
    .or(z.literal("")),
  skillLevel: z.coerce.number().min(2.5).max(5.0).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
