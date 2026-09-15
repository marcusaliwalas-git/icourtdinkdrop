"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { SOCIAL_PLATFORMS } from "@/lib/footer";

type Result = { error?: string; success?: boolean };

const platform = z.enum(SOCIAL_PLATFORMS.map((p) => p.value) as [string, ...string[]]);
const url = z.string().trim().url("Enter a full URL (including https://).").max(500);

const footerSchema = z.object({
  about: z.string().trim().max(600).optional().or(z.literal("")),
  email: z.email("Enter a valid email.").max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  socials: z.array(z.object({ platform, url })).max(8),
  // Custom links allow site-relative paths (e.g. /coaches) as well as full URLs.
  links: z.array(z.object({ label: z.string().trim().min(1).max(60), url: z.string().trim().min(1).max(500) })).max(10),
});

export async function updateFooter(input: unknown): Promise<Result> {
  const parsed = footerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { supabase } = await requireAdmin();
  const tenant = await getTenant();
  if (!tenant) return { error: "No venue resolved for this host." };

  const { data, error } = await supabase
    .from("venues")
    .update({
      footer_about: parsed.data.about || null,
      footer_email: parsed.data.email || null,
      footer_phone: parsed.data.phone || null,
      footer_address: parsed.data.address || null,
      footer_socials: parsed.data.socials,
      footer_links: parsed.data.links,
    })
    .eq("id", tenant.id)
    .select("id");
  if (error) return { error: error.message };
  // RLS scopes the write to the admin's own venue; a 0-row result means the account isn't linked
  // to this venue, so the update was silently dropped rather than saved.
  if (!data?.length) return { error: "Couldn't save — your account isn't linked to this venue." };

  revalidatePath("/", "layout");
  revalidatePath("/admin/footer");
  return { success: true };
}
