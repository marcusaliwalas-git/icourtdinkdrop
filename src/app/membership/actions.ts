"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { getAdminEmails } from "@/lib/admin-recipients";
import { tenantEmailBrand } from "@/lib/site-url";
import { sendAdminMembershipRequestEmail } from "@/lib/email";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: request, error } = await supabase.rpc("submit_membership_request", {
    p_plan: input.planId,
    p_reference: input.paymentReference || undefined,
    p_slip_path: input.paymentSlipPath || undefined,
  });

  if (error) {
    const key = Object.keys(ERR).find((k) => error.message?.includes(k));
    return { success: false, message: key ? ERR[key] : "Couldn't submit your request. Please try again." };
  }

  // Notify the venue's admins that a payment is waiting for review (best-effort).
  try {
    if (user && request) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, email")
        .eq("id", user.id)
        .maybeSingle();
      // Same-tier guard means an existing active membership here is a renewal, not a new purchase.
      const { count } = await supabase
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", user.id)
        .eq("venue_id", venue.id)
        .eq("status", "active");
      const brand = tenantEmailBrand(venue);
      const adminEmails = await getAdminEmails(venue.id);
      const memberName = profile?.full_name ?? profile?.email ?? user.email ?? "A member";
      await Promise.all(
        adminEmails.map((to) =>
          sendAdminMembershipRequestEmail({
            to,
            memberName,
            memberContact: profile?.phone ?? profile?.email ?? user.email ?? "—",
            tier: request.tier,
            amountCents: request.amount_cents,
            paymentReference: request.payment_reference,
            isRenewal: (count ?? 0) > 0,
            ...brand,
          })
        )
      );
    }
  } catch (err) {
    console.error("Failed to send membership request admin email:", err);
  }

  revalidatePath("/membership");
  return { success: true };
}
