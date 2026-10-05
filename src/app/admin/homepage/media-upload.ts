"use client";

import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 50 * 1024 * 1024;

export type MediaResult = { url: string; type: "image" | "video" } | { error: string };

/** Upload an image or video to the public venue-media bucket, returning its URL + kind. */
export async function uploadVenueMedia(file: File): Promise<MediaResult> {
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) return { error: "Choose an image or video file." };
  if (file.size > MAX_BYTES) return { error: "That file is too large — keep it under 50MB." };

  const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
  const path = `${crypto.randomUUID()}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage.from("venue-media").upload(path, file, { contentType: file.type });
  if (error) return { error: `Couldn't upload: ${error.message}` };

  return {
    url: supabase.storage.from("venue-media").getPublicUrl(path).data.publicUrl,
    type: isVideo ? "video" : "image",
  };
}
