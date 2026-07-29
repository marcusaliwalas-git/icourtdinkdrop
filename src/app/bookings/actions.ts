"use server";

import { createClient } from "@/lib/supabase/server";

export interface GuestBookingLookup {
  id: string;
  court_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  party_size: number;
  total_cents: number;
  payment_status: string;
  reference_code: string;
}

export async function lookupBookingByReference(
  referenceCode: string
): Promise<{ booking: GuestBookingLookup } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_booking_by_reference", {
    p_reference_code: referenceCode.trim(),
  });

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No booking found with that reference code." };

  return { booking: data[0] };
}
