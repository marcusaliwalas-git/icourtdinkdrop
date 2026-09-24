"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export type SubmitResult = { success: true } | { success: false; message: string };

const ERR: Record<string, string> = {
  NOT_SIGNED_IN: "Please sign in first.",
  FEATURE_DISABLED: "Membership isn't available at this venue.",
  PLAN_NOT_CONFIGURED: "Membership isn't set up yet — please check back later.",
  REQUEST_PENDING: "You already have a request awaiting review.",
  VENUE_NOT_FOUND: "Venue not found.",
};

export async function submitMembershipRequest(input: {
  paymentReference?: string;
  paymentSlipPath?: string;
}): Promise<SubmitResult> {
  const supabase = await createClient();
  const venue = await getTenant();
  if (!venue) return { success: false, message: "Venue not found." };

  const { error } = await supabase.rpc("submit_membership_request", {
    p_venue: venue.id,
    p_reference: input.paymentReference || undefined,
    p_slip_path: input.paymentSlipPath || undefined,
  });

  if (error) {
    const key = Object.keys(ERR).find((k) => error.message?.includes(k));
    return { success: false, message: key ? ERR[key] : "Couldn't submit your request. Please try again." };
  }

  revalidatePath("/membership");
  return { success: true };
}
