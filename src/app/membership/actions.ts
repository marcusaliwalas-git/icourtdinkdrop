"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export type SubmitResult = { success: true } | { success: false; message: string };

const ERR: Record<string, string> = {
  NOT_SIGNED_IN: "Please sign in first.",
  FEATURE_DISABLED: "Membership isn't available at this venue.",
  PLAN_NOT_FOUND: "That plan is no longer available — pick another.",
  REQUEST_PENDING: "You already have a request awaiting review.",
  TIER_LOCKED: "You can only renew your current tier. To change tiers, contact the venue.",
};

export async function submitMembershipRequest(input: {
  planId: string;
  paymentReference?: string;
  paymentSlipPath?: string;
}): Promise<SubmitResult> {
  const supabase = await createClient();
  const venue = await getTenant();
  if (!venue) return { success: false, message: "Venue not found." };

  const { error } = await supabase.rpc("submit_membership_request", {
    p_plan: input.planId,
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
