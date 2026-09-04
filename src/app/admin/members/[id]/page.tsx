import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInTimezone } from "@/lib/time";
import { parseTstzRange } from "@/lib/availability";
import { getTenant } from "@/lib/tenant";
import { MemberActions } from "./member-actions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  confirmed: "default",
  cancelled: "secondary",
  completed: "secondary",
  no_show: "destructive",
  pending: "secondary",
};

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, phone, skill_level, role, no_show_count, booking_restricted_until, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!profile) notFound();

  // Scope this member's booking history to the current venue — otherwise a multi-venue admin sees
  // the member's bookings at their other venues too.
  const venue = await getTenant();
  let bookingsQuery = supabase
    .from("bookings")
    .select("id, status, party_size, total_cents, payment_status, time_range, courts!inner(name, venue_id)")
    .eq("booked_by", id)
    .order("time_range", { ascending: false })
    .limit(50);
  if (venue) bookingsQuery = bookingsQuery.eq("courts.venue_id", venue.id);

  const [{ data: memberships }, { data: bookings }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, tier, status, starts_on, ends_on")
      .eq("profile_id", id)
      .order("starts_on", { ascending: false }),
    bookingsQuery,
  ]);

  const restricted = profile.booking_restricted_until && new Date(profile.booking_restricted_until) > new Date();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{profile.full_name || "(no name)"}</h1>
        <p className="text-sm text-muted-foreground">{profile.phone ?? "No phone on file"}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary" className="capitalize">
          {profile.role}
        </Badge>
        {profile.skill_level && <Badge variant="secondary">Skill {profile.skill_level}</Badge>}
        <Badge variant={profile.no_show_count > 0 ? "destructive" : "secondary"}>
          {profile.no_show_count} no-show{profile.no_show_count === 1 ? "" : "s"}
        </Badge>
        {restricted && <Badge variant="destructive">Restricted until {profile.booking_restricted_until?.slice(0, 10)}</Badge>}
      </div>

      <MemberActions
        profileId={profile.id}
        noShowCount={profile.no_show_count}
        restrictedUntil={profile.booking_restricted_until}
      />

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Memberships</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>From</TableHead>
              <TableHead>Until</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(memberships ?? []).map((m) => (
              <TableRow key={m.id}>
                <TableCell className="capitalize">{m.tier}</TableCell>
                <TableCell className="capitalize">{m.status}</TableCell>
                <TableCell>{m.starts_on}</TableCell>
                <TableCell>{m.ends_on ?? "-"}</TableCell>
              </TableRow>
            ))}
            {(memberships ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No membership on file.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Booking history</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Court</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(bookings ?? []).map((b) => {
              const { start } = parseTstzRange(b.time_range);
              const courtName = (b.courts as unknown as { name: string } | null)?.name ?? "-";
              return (
                <TableRow key={b.id}>
                  <TableCell>{courtName}</TableCell>
                  <TableCell>{formatInTimezone(start, "MMM d, yyyy h:mm a")}</TableCell>
                  <TableCell>{(b.total_cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" })}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[b.status] ?? "secondary"}>{b.status}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {(bookings ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No bookings yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
