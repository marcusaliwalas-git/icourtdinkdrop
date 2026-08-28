"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { venueSectionSchema } from "@/lib/validation/venue";
import { z } from "zod";

type Result = { error?: string; success?: boolean };

const heroSchema = z.object({
  heroHeading: z.string().trim().max(200).optional().or(z.literal("")),
  heroSubheading: z.string().trim().max(600).optional().or(z.literal("")),
  heroMediaUrl: z.string().trim().max(500).optional().or(z.literal("")),
  heroMediaType: z.enum(["image", "video"]).optional().or(z.literal("")),
});

function revalidateHome() {
  revalidatePath("/");
  revalidatePath("/admin/homepage");
}

export async function updateHero(input: unknown): Promise<Result> {
  const parsed = heroSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { supabase } = await requireAdmin();
  const tenant = await getTenant();
  if (!tenant) return { error: "No venue resolved for this host." };

  const { error } = await supabase
    .from("venues")
    .update({
      hero_heading: parsed.data.heroHeading || null,
      hero_subheading: parsed.data.heroSubheading || null,
      hero_media_url: parsed.data.heroMediaUrl || null,
      hero_media_type: parsed.data.heroMediaType || null,
    })
    .eq("id", tenant.id);
  if (error) return { error: error.message };

  revalidateHome();
  return { success: true };
}

export async function upsertSection(sectionId: string | null, input: unknown): Promise<Result> {
  const parsed = venueSectionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const { supabase } = await requireAdmin();
  // RLS also enforces this, but pin the venue to the admin's own so a stray id can't cross tenants.
  const tenant = await getTenant();
  if (!tenant || tenant.id !== d.venueId) return { error: "That section isn't for your venue." };

  const row = {
    venue_id: d.venueId,
    title: d.title || null,
    body: d.body || null,
    media_url: d.mediaUrl || null,
    media_type: d.mediaType || null,
    sort_order: d.sortOrder,
    is_visible: d.isVisible,
  };

  const { error } = sectionId
    ? await supabase.from("venue_sections").update(row).eq("id", sectionId)
    : await supabase.from("venue_sections").insert(row);
  if (error) return { error: error.message };

  revalidateHome();
  return { success: true };
}

export async function deleteSection(sectionId: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("venue_sections").delete().eq("id", sectionId);
  if (error) return { error: error.message };
  revalidateHome();
  return { success: true };
}
