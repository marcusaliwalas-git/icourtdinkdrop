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
 * The link uses the token_hash/OTP flow via /auth/confirm, so it works when opened in a different
 * browser or device (unlike the client PKCE `code` flow, whose verifier is tied to the originating
 * browser). Always returns { ok: true } and never reveals whether the account exists.
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

    const resetUrl = `${brand.siteUrl}/auth/confirm?token_hash=${hashedToken}&type=recovery&next=/reset-password`;
    await sendPasswordResetEmail({ to: trimmed, resetUrl, ...brand });
  } catch (err) {
    console.error("Password reset email failed:", err);
  }

  return { ok: true };
}
