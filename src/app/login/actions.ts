"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getTenant } from "@/lib/tenant";
import { tenantEmailBrand } from "@/lib/site-url";
import { sendPasswordResetEmail } from "@/lib/email";

/**
 * Send a password-reset email through the current tenant's own sender (Resend), matching all our
 * other venue emails. We generate the recovery link server-side with the admin API (generateLink) —
 * which does NOT send Supabase's built-in email — and deliver our own branded message.
 *
 * The link carries the token_hash/OTP to /reset-password, which verifies it only when the user
 * SUBMITS the new password (not on page load). That survives email link-scanners (e.g. Outlook
 * SafeLinks) that pre-fetch the URL — a GET prefetch would otherwise consume the single-use token
 * and break the real click. It also works cross-device (no PKCE verifier needed). Always returns
 * { ok: true } and never reveals whether the account exists.
 */
export async function requestPasswordReset(email: string): Promise<{ ok: true }> {
  const trimmed = (email || "").trim().toLowerCase();
  if (!trimmed) return { ok: true };

  try {
    const tenant = await getTenant();
    const brand = tenantEmailBrand(tenant);
    const admin = createAdminClient();

    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: trimmed });
    const hashedToken = data?.properties?.hashed_token;
    if (error || !hashedToken) return { ok: true }; // unknown email / error — stay silent

    const resetUrl = `${brand.siteUrl}/reset-password?token_hash=${hashedToken}&type=recovery`;
    await sendPasswordResetEmail({ to: trimmed, resetUrl, ...brand });
  } catch (err) {
    console.error("Password reset email failed:", err);
  }

  return { ok: true };
}
