import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BookingCard } from "./booking-card";

export const dynamic = "force-dynamic";

export default async function MyBookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="mb-4 text-muted-foreground">Sign in to see your bookings.</p>
        <Link href="/login" className="underline underline-offset-2">
          Sign in
        </Link>
        <p className="mt-6 text-sm text-muted-foreground">
          Booked as a guest?{" "}
          <Link href="/bookings/guest" className="underline underline-offset-2">
            Manage with your reference code
          </Link>
        </p>
      </div>
    );
  }

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, status, party_size, total_cents, payment_status, reference_code, time_range, courts(name, venues(timezone))")
    .eq("booked_by", user.id)
    .order("time_range", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold">My bookings</h1>
      <div className="flex flex-col gap-3">
        {(bookings ?? []).map((b) => {
          const tz = (b.courts as unknown as { venues: { timezone: string } })?.venues?.timezone ?? "Asia/Manila";
          return <BookingCard key={b.id} booking={b as never} timezone={tz} />;
        })}
        {(bookings ?? []).length === 0 && (
          <p className="text-center text-muted-foreground">
            No bookings yet.{" "}
            <Link href="/book" className="underline underline-offset-2">
              Book a court
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
