import { z } from "zod";

// Onboarding a new tenant (venue) + its first admin. Mirrors supabase/create-tenant.ts.
export const createTenantSchema = z.object({
  name: z.string().trim().min(1, "Enter the venue name.").max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, numbers, and hyphens only.")
    .min(1)
    .max(63),
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/, "Enter a valid domain, e.g. acmepickleball.com")
    .optional()
    .or(z.literal("")),
  timezone: z.string().trim().min(1).max(64).default("Asia/Manila"),
  adminEmail: z.email("Enter a valid admin email."),
  adminPassword: z.string().min(8, "Admin password must be at least 8 characters.").max(200),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
