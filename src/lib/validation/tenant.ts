import { z } from "zod";

/** Turn a venue name into a URL-safe subdomain slug: lowercase, accents stripped, non-alphanumerics
 * collapsed to hyphens. Returns "" when the name has no usable characters. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accent marks
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

// Onboarding a new tenant (venue) + its first admin. Mirrors supabase/create-tenant.ts.
export const createTenantSchema = z.object({
  name: z.string().trim().min(1, "Enter the venue name.").max(160),
  // Optional: blank means "derive it from the venue name" (done in the action).
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, numbers, and hyphens only.")
    .max(63)
    .optional()
    .or(z.literal("")),
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
