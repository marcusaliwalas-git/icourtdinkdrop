"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenant } from "@/lib/tenant";
import { tenantEmailBrand } from "@/lib/site-url";
import { sendMembershipApprovedEmail, sendMembershipRejectedEmail } from "@/lib/email";

export type ReviewResult = { success: true } | { success: false; message: string };

const ERR: Record<string, string> = {
  NOT_FOUND: "That request no longer exists.",
  NOT_AUTHORIZED: "You can't review this request.",
  ALREADY_REVIEWED: "This request was already reviewed.",
};

/** Approve (grant/extend membership) or reject a subscription request. Admin only via the RPC. */
export async function reviewMembershipRequest(
  requestId: string,
  approve: boolean,
  notes?: string
): Promise<ReviewResult> {
  const { supabase } = await requireAdmin();
  const { data: request, error } = await supabase.rpc("review_membership_request", {
    p_request: requestId,
    p_approve: approve,
    p_notes: notes || undefined,
  });
  if (error) {
    const key = Object.keys(ERR).find((k) => error.message?.includes(k));
    return { success: false, message: key ? ERR[key] : "Couldn't update the request. Please try again." };
  }

  // Notify the member of the outcome — approved (now active) or rejected (with reason). Best-effort.
  if (request) {
    try {
      const venue = await getTenant();
      const adminClient = createAdminClient();
      // Member email — profiles mirror it; fall back to auth.users via the service-role client.
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", request.profile_id).maybeSingle();
      let email = profile?.email ?? null;
      if (!email) {
        const { data: authUser } = await adminClient.auth.admin.getUserById(request.profile_id);
        email = authUser?.user?.email ?? null;
      }

      if (email && venue) {
        if (approve) {
          // The now-active membership's end date, for "active until".
          const { data: membership } = await adminClient
            .from("memberships")
            .select("ends_on")
            .eq("profile_id", request.profile_id)
            .eq("venue_id", request.venue_id)
            .eq("status", "active")
            .order("ends_on", { ascending: false, nullsFirst: true })
            .limit(1)
            .maybeSingle();
          await sendMembershipApprovedEmail({
            to: email,
            tier: request.tier,
            endsOn: membership?.ends_on ?? null,
            timezone: venue.timezone,
            ...tenantEmailBrand(venue),
          });
        } else {
          await sendMembershipRejectedEmail({
            to: email,
            tier: request.tier,
            reason: request.review_notes ?? null,
            ...tenantEmailBrand(venue),
          });
        }
      }
    } catch (err) {
      console.error("Failed to send membership review email:", err);
    }
  }

  revalidatePath("/admin/members/requests");
  revalidatePath("/admin/members");
  return { success: true };
}

/** A short-lived signed URL for the request's receipt. The payment-slips bucket has no select
 * policy, so the URL is minted server-side with the service-role client (same as booking proof). */
export async function getMembershipReceipt(
  requestId: string
): Promise<{ paymentReference: string | null; slipUrl: string | null }> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("membership_requests")
    .select("payment_reference, payment_slip_path")
    .eq("id", requestId)
    .maybeSingle();

  const base = { paymentReference: data?.payment_reference ?? null };
  if (!data?.payment_slip_path) return { ...base, slipUrl: null };

  const adminClient = createAdminClient();
  const { data: signed } = await adminClient.storage
    .from("payment-slips")
    .createSignedUrl(data.payment_slip_path, 60 * 10);
  return { ...base, slipUrl: signed?.signedUrl ?? null };
}
