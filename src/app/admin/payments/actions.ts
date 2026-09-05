"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { tenantEmailBrand } from "@/lib/site-url";
import { mapBookingError } from "@/lib/booking-errors";
import { parseTstzRange } from "@/lib/availability";
import { sendBookingGroupConfirmationEmail } from "@/lib/email";

type Result = { success: boolean; error?: string };

function revalidateAll() {
  revalidatePath("/admin/payments");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/bookings");
  revalidatePath("/bookings");
}

/** Confirm every pending booking in a cart and send one confirmation email listing all slots. */
export async function adminConfirmBookingGroup(groupId: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("confirm_booking_group", { p_group_id: groupId });
  if (error) return { success: false, error: mapBookingError(error).message };

  // One email for the whole cart. profiles.email backfills a member with no guest_email.
  const { data: rows } = await supabase
    .from("bookings")
    .select("time_range, reference_code, total_cents, guest_email, courts(name, venues(timezone)), profiles(email)")
    .eq("booking_group_id", groupId)
    .order("time_range");

  const list = rows ?? [];
  if (list.length) {
    const first = list[0] as unknown as {
      reference_code: string;
      guest_email: string | null;
      courts: { name: string; venues: { timezone: string } | null } | null;
      profiles: { email: string | null } | null;
    };
    const to = first.profiles?.email ?? first.guest_email ?? null;
    if (to) {
      const timezone = first.courts?.venues?.timezone ?? "Asia/Manila";
      const slots = list.map((b) => {
        const row = b as unknown as { time_range: string; courts: { name: string } | null };
        const { start, end } = parseTstzRange(row.time_range);
        return { courtName: row.courts?.name ?? "Court", startsAt: start, endsAt: end };
      });
      const totalCents = list.reduce((sum, b) => sum + (b as unknown as { total_cents: number }).total_cents, 0);
      await sendBookingGroupConfirmationEmail({
        to,
        slots,
        timezone,
        referenceCode: first.reference_code,
        totalCents,
        ...tenantEmailBrand(await getTenant()),
      });
    }
  }

  revalidateAll();
  return { success: true };
}

/** How many other pending slots share this booking's cart — so the calendar action sheet can offer
 * "Confirm all" instead of confirming one slot at a time. */
export async function getBookingGroupPending(bookingId: string): Promise<{ groupId: string | null; pendingCount: number }> {
  const { supabase } = await requireAdmin();
  const { data: b } = await supabase.from("bookings").select("booking_group_id").eq("id", bookingId).maybeSingle();
  const groupId = b?.booking_group_id ?? null;
  if (!groupId) return { groupId: null, pendingCount: 0 };
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("booking_group_id", groupId)
    .eq("status", "pending");
  return { groupId, pendingCount: count ?? 0 };
}

/** Reject (cancel) every not-yet-started booking in a cart. */
export async function adminRejectBookingGroup(groupId: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("cancel_booking_group", { p_group_id: groupId });
  if (error) return { success: false, error: mapBookingError(error).message };
  revalidateAll();
  return { success: true };
}
