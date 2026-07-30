import "server-only";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { formatInTimezone } from "@/lib/time";

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

let localTransport: nodemailer.Transporter | null = null;

/**
 * Dev-only fallback: when RESEND_API_KEY isn't set, route through the local Supabase
 * Mailpit SMTP server (see LOCAL_SMTP_URL in .env.local) instead of just logging and
 * skipping, so booking emails are actually visible and verifiable in local development.
 * Production must set RESEND_API_KEY; LOCAL_SMTP_URL has no effect once that's set.
 */
function getLocalTransport(): nodemailer.Transporter | null {
  if (!process.env.LOCAL_SMTP_URL) return null;
  if (!localTransport) localTransport = nodemailer.createTransport(process.env.LOCAL_SMTP_URL);
  return localTransport;
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
  if (resend) {
    try {
      await resend.emails.send(payload);
    } catch (err) {
      console.error("Failed to send email:", err);
    }
    return;
  }

  const local = getLocalTransport();
  if (local) {
    try {
      await local.sendMail({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: "html" in payload ? payload.html ?? undefined : undefined,
      });
    } catch (err) {
      console.error("Failed to send email via local SMTP:", err);
    }
    return;
  }

  console.warn("No email transport configured — skipping email send:", payload.subject);
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

/** Sent immediately when an online booking is created — it's 'pending' until an admin confirms it. */
export async function sendBookingPendingEmail(details: BookingEmailDetails) {
  const from = process.env.RESEND_FROM_EMAIL ?? "bookings@example.com";
  const when = formatInTimezone(details.startsAt, "EEEE, MMM d 'at' h:mm a", details.timezone);
  const until = formatInTimezone(details.endsAt, "h:mm a", details.timezone);

  await safeSend({
    from,
    to: details.to,
    subject: `Booking request received: ${details.courtName}, ${when}`,
    html: `
      <p>We've received your booking request — it's awaiting confirmation from the venue.</p>
      <p><strong>${details.courtName}</strong><br/>${when} – ${until}</p>
      <p>Reference code: <strong>${details.referenceCode}</strong></p>
      <p>Total: ${pesos(details.totalCents)} — pay at the venue.</p>
      <p>We'll email you again once it's confirmed.</p>
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
