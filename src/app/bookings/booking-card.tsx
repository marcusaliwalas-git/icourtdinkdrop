import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatInTimezone } from "@/lib/time";
import { parseTstzRange } from "@/lib/availability";

interface Booking {
  id: string;
  status: string;
  party_size: number;
  total_cents: number;
  payment_status: string;
  reference_code: string;
  time_range: string;
  courts: { name: string } | null;
}

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  confirmed: "default",
  cancelled: "secondary",
  completed: "secondary",
  no_show: "destructive",
  pending: "secondary",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting confirmation",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pay_at_venue: "pay at venue",
  paid_at_venue: "paid",
  awaiting_verification: "payment awaiting verification",
  paid_online: "paid online",
  refunded: "refunded",
  partially_refunded: "partially refunded",
};

export function BookingCard({ booking, timezone }: { booking: Booking; timezone: string }) {
  const { start, end } = parseTstzRange(booking.time_range);

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div>
          <p className="font-medium">{booking.courts?.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatInTimezone(start, "EEE, MMM d 'at' h:mm a", timezone)} –{" "}
            {formatInTimezone(end, "h:mm a", timezone)}
          </p>
          <p className="text-xs text-muted-foreground">
            Ref {booking.reference_code} · {pesos(booking.total_cents)} (
            {PAYMENT_STATUS_LABEL[booking.payment_status] ?? booking.payment_status})
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[booking.status] ?? "secondary"}>
          {STATUS_LABEL[booking.status] ?? booking.status}
        </Badge>
      </CardContent>
    </Card>
  );
}
