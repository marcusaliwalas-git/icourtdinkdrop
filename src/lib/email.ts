import "server-only";
import { Resend } from "resend";
import { formatInTimezone } from "@/lib/time";

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

interface BookingEmailDetails {
  to: string;
  courtName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  referenceCode: string;
  totalCents: number;
}

function pesos(cents: number) {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

/** Best-effort send: booking success should never depend on email deliverability. */
async function safeSend(payload: Parameters<Resend["emails"]["send"]>[0]) {
  const resend = getClient();
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping email send:", payload.subject);
    return;
  }
  try {
    await resend.emails.send(payload);
  } catch (err) {
    console.error("Failed to send email:", err);
  }
}

export async function sendBookingConfirmationEmail(details: BookingEmailDetails) {
  const from = process.env.RESEND_FROM_EMAIL ?? "bookings@example.com";
  const when = formatInTimezone(details.startsAt, "EEEE, MMM d 'at' h:mm a", details.timezone);
  const until = formatInTimezone(details.endsAt, "h:mm a", details.timezone);

  await safeSend({
    from,
    to: details.to,
    subject: `Booking confirmed: ${details.courtName}, ${when}`,
    html: `
      <p>Your court is booked.</p>
      <p><strong>${details.courtName}</strong><br/>${when} – ${until}</p>
      <p>Reference code: <strong>${details.referenceCode}</strong></p>
      <p>Total: ${pesos(details.totalCents)} — pay at the venue.</p>
      <p>Show your reference code at check-in.</p>
    `,
  });
}

export async function sendBookingCancellationEmail(details: Omit<BookingEmailDetails, "totalCents">) {
  const from = process.env.RESEND_FROM_EMAIL ?? "bookings@example.com";
  const when = formatInTimezone(details.startsAt, "EEEE, MMM d 'at' h:mm a", details.timezone);

  await safeSend({
    from,
    to: details.to,
    subject: `Booking cancelled: ${details.courtName}, ${when}`,
    html: `
      <p>Your booking for <strong>${details.courtName}</strong> on ${when} has been cancelled.</p>
      <p>Reference code: ${details.referenceCode}</p>
    `,
  });
}

/** wa.me deep-link fallback (spec 4.9) for guest bookings that have no email on file. */
export function buildWhatsAppShareLink(details: {
  courtName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  referenceCode: string;
}): string {
  const when = formatInTimezone(details.startsAt, "EEE, MMM d 'at' h:mm a", details.timezone);
  const until = formatInTimezone(details.endsAt, "h:mm a", details.timezone);
  const text = `Court booked: ${details.courtName}, ${when}-${until}. Reference: ${details.referenceCode}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
