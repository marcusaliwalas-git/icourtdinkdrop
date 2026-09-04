"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";

type Result = { error?: string; success?: boolean };

const schema = z
  .object({
    enabled: z.boolean(),
    type: z.enum(["text", "image"]),
    text: z.string().trim().max(280).optional().or(z.literal("")),
    imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
    // Optional click-through; allows a site-relative path (/book) or a full URL.
    link: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((d) => !d.enabled || d.type !== "text" || !!d.text, {
    message: "Add the announcement text, or turn the banner off.",
    path: ["text"],
  })
  .refine((d) => !d.enabled || d.type !== "image" || !!d.imageUrl, {
    message: "Upload an image, or turn the banner off.",
    path: ["imageUrl"],
  });

export async function updateAnnouncement(input: unknown): Promise<Result> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { supabase } = await requireAdmin();
  const tenant = await getTenant();
  if (!tenant) return { error: "No venue resolved for this host." };

  const { data, error } = await supabase
    .from("venues")
    .update({
      announcement_enabled: parsed.data.enabled,
      announcement_type: parsed.data.type,
      announcement_text: parsed.data.text || null,
      announcement_image_url: parsed.data.imageUrl || null,
      announcement_link: parsed.data.link || null,
    })
    .eq("id", tenant.id)
    .select("id");
  if (error) return { error: error.message };
  // RLS scopes the write to the admin's own venue; a 0-row result means the account isn't linked
  // to this venue, so the update was silently dropped rather than saved.
  if (!data?.length) return { error: "Couldn't save — your account isn't linked to this venue." };

  revalidatePath("/", "layout");
  revalidatePath("/admin/announcement");
  return { success: true };
}
