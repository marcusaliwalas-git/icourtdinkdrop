import "server-only";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { formatInTimezone } from "@/lib/time";
import { renderEmail } from "@/lib/email-template";

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

/** Adds a display name so the inbox shows "iCourt Social", not a bare address. */
function fromAddress(): string {
  const email = process.env.RESEND_FROM_EMAIL ?? "bookings@example.com";
  return `iCourt Social <${email}>`;
}

interface BookingEmailDetails {
  to: string;
  courtName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  referenceCode: string;
  totalCents: number;
  siteUrl: string;
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

// Links are built from the tenant's own base URL (passed in as details.siteUrl), so each venue's
// emails point at that venue's host rather than a single shared one.
const homeUrl = (base: string) => `${base}/`;
// Admins get sent straight to the pending-review queue they need to act on.
const adminPendingUrl = (base: string) => `${base}/admin/bookings?status=pending`;

export async function sendBookingConfirmationEmail(details: BookingEmailDetails) {
  const when = formatInTimezone(details.startsAt, "EEEE, MMM d 'at' h:mm a", details.timezone);
  const until = formatInTimezone(details.endsAt, "h:mm a", details.timezone);

  await safeSend({
    from: fromAddress(),
    to: details.to,
    subject: `Booking confirmed: ${details.courtName}, ${when}`,
    html: renderEmail({
      heading: "Your booking is confirmed 🎉",
      intro: ["The venue has verified your payment — your court is reserved. Show your reference code at check-in."],
      detailRows: [
        { label: "Court", value: details.courtName },
        { label: "When", value: `${when} – ${until}` },
        { label: "Reference", value: details.referenceCode, mono: true },
        { label: "Total paid", value: pesos(details.totalCents) },
      ],
      button: { label: "Open iCourt Social", url: homeUrl(details.siteUrl) },
    }),
  });
}

/** Sent immediately when an online booking is created — it's 'pending' until an admin confirms it. */
export async function sendBookingPendingEmail(details: BookingEmailDetails) {
  const when = formatInTimezone(details.startsAt, "EEEE, MMM d 'at' h:mm a", details.timezone);
  const until = formatInTimezone(details.endsAt, "h:mm a", details.timezone);

  await safeSend({
    from: fromAddress(),
    to: details.to,
    subject: `Booking request received: ${details.courtName}, ${when}`,
    html: renderEmail({
      heading: "We've got your booking request",
      intro: ["Thanks! We received your booking and payment reference. The venue is verifying your transfer before confirming — we'll email you again the moment it's approved."],
      detailRows: [
        { label: "Court", value: details.courtName },
        { label: "When", value: `${when} – ${until}` },
        { label: "Reference", value: details.referenceCode, mono: true },
        { label: "Total", value: pesos(details.totalCents) },
      ],
      button: { label: "Open iCourt Social", url: homeUrl(details.siteUrl) },
    }),
  });
}

export async function sendBookingCancellationEmail(details: Omit<BookingEmailDetails, "totalCents">) {
  const when = formatInTimezone(details.startsAt, "EEEE, MMM d 'at' h:mm a", details.timezone);
  const until = formatInTimezone(details.endsAt, "h:mm a", details.timezone);

  await safeSend({
    from: fromAddress(),
    to: details.to,
    subject: `Booking cancelled: ${details.courtName}, ${when}`,
    html: renderEmail({
      accent: "red",
      heading: "Your booking was cancelled",
      intro: ["This booking has been cancelled. If this wasn't you, or you'd like to rebook, you can start a new booking any time."],
      detailRows: [
        { label: "Court", value: details.courtName },
        { label: "When", value: `${when} – ${until}` },
        { label: "Reference", value: details.referenceCode, mono: true },
      ],
      button: { label: "Book another court", url: homeUrl(details.siteUrl) },
    }),
  });
}

/** Sent when an admin moves a booking to a new court/time. */
export async function sendBookingRescheduledEmail(details: BookingEmailDetails) {
  const when = formatInTimezone(details.startsAt, "EEEE, MMM d 'at' h:mm a", details.timezone);
  const until = formatInTimezone(details.endsAt, "h:mm a", details.timezone);

  await safeSend({
    from: fromAddress(),
    to: details.to,
    subject: `Booking rescheduled: ${details.courtName}, ${when}`,
    html: renderEmail({
      heading: "Your booking has been rescheduled",
      intro: ["The venue moved your booking to a new time. Here are the updated details — your reference code stays the same."],
      detailRows: [
        { label: "Court", value: details.courtName },
        { label: "New time", value: `${when} – ${until}` },
        { label: "Reference", value: details.referenceCode, mono: true },
        { label: "Total", value: pesos(details.totalCents) },
      ],
      button: { label: "Open iCourt Social", url: homeUrl(details.siteUrl) },
    }),
  });
}

export interface BookingLineItem {
  courtName: string;
  startsAt: Date;
  endsAt: Date;
  referenceCode: string;
}

interface BookingsEmailDetails {
  to: string;
  timezone: string;
  bookings: BookingLineItem[];
  totalCents: number;
  siteUrl: string;
}

/** One line per booking in a cart: "Court 1 · Sat, Aug 30 at 6:00 PM – 8:00 PM (ABC12345)". */
function bookingLineRows(bookings: BookingLineItem[], timezone: string) {
  return bookings.map((b) => {
    const when = formatInTimezone(b.startsAt, "EEE, MMM d 'at' h:mm a", timezone);
    const until = formatInTimezone(b.endsAt, "h:mm a", timezone);
    return { label: b.courtName, value: `${when} – ${until} · ${b.referenceCode}`, mono: false };
  });
}

/** Pending email for a cart of bookings created together (multiple courts/slots, one payment). */
export async function sendBookingsPendingEmail(details: BookingsEmailDetails) {
  const count = details.bookings.length;
  await safeSend({
    from: fromAddress(),
    to: details.to,
    subject: `Booking request received: ${count} slot${count > 1 ? "s" : ""}`,
    html: renderEmail({
      heading: "We've got your booking request",
      intro: [
        `Thanks! We received your ${count} booking${count > 1 ? "s" : ""} and payment reference. The venue is verifying your transfer before confirming — we'll email you again once it's approved.`,
      ],
      detailRows: [
        ...bookingLineRows(details.bookings, details.timezone),
        { label: "Total", value: pesos(details.totalCents) },
      ],
      button: { label: "Open iCourt Social", url: homeUrl(details.siteUrl) },
    }),
  });
}

export interface AdminBookingsRequestDetails {
  to: string;
  timezone: string;
  bookings: BookingLineItem[];
  totalCents: number;
  bookerName: string;
  bookerContact: string;
  paymentReference: string | null;
  siteUrl: string;
}

/** Notifies an admin that a cart of bookings is awaiting review. */
export async function sendAdminBookingsRequestEmail(details: AdminBookingsRequestDetails) {
  const count = details.bookings.length;
  await safeSend({
    from: fromAddress(),
    to: details.to,
    subject: `New booking to review: ${count} slot${count > 1 ? "s" : ""} from ${details.bookerName}`,
    html: renderEmail({
      heading: "A booking is waiting for your review",
      intro: [
        `${details.bookerName} just requested ${count} slot${count > 1 ? "s" : ""} and submitted a payment reference. Verify the payment, then confirm or cancel the bookings.`,
      ],
      detailRows: [
        { label: "Booked by", value: details.bookerName },
        { label: "Contact", value: details.bookerContact },
        ...bookingLineRows(details.bookings, details.timezone),
        { label: "Payment ref", value: details.paymentReference ?? "—" },
        { label: "Total", value: pesos(details.totalCents) },
      ],
      button: { label: "Review bookings", url: adminPendingUrl(details.siteUrl) },
      outro: ["Open the admin dashboard to view the payment proof and take action."],
    }),
  });
}

export interface AdminBookingRequestDetails {
  to: string;
  courtName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  referenceCode: string;
  totalCents: number;
  bookerName: string;
  bookerContact: string;
  paymentReference: string | null;
  siteUrl: string;
}

/** Notifies an admin that a new online booking is awaiting their review/confirmation. */
export async function sendAdminBookingRequestEmail(details: AdminBookingRequestDetails) {
  const when = formatInTimezone(details.startsAt, "EEEE, MMM d 'at' h:mm a", details.timezone);
  const until = formatInTimezone(details.endsAt, "h:mm a", details.timezone);

  await safeSend({
    from: fromAddress(),
    to: details.to,
    subject: `New booking to review: ${details.courtName}, ${when}`,
    html: renderEmail({
      heading: "A booking is waiting for your review",
      intro: [
        `${details.bookerName} just requested a court and submitted a payment reference. Verify the payment, then confirm or cancel the booking.`,
      ],
      detailRows: [
        { label: "Booked by", value: details.bookerName },
        { label: "Contact", value: details.bookerContact },
        { label: "Court", value: details.courtName },
        { label: "When", value: `${when} – ${until}` },
        { label: "Reference", value: details.referenceCode, mono: true },
        { label: "Payment ref", value: details.paymentReference ?? "—" },
        { label: "Total", value: pesos(details.totalCents) },
      ],
      button: { label: "Review booking", url: adminPendingUrl(details.siteUrl) },
      outro: ["Open the admin dashboard to view the payment proof and take action."],
    }),
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

/** wa.me share for a cart of bookings — one message listing every slot and its reference. */
export function buildWhatsAppShareLinkForBookings(details: {
  timezone: string;
  bookings: BookingLineItem[];
}): string {
  const lines = details.bookings.map((b) => {
    const when = formatInTimezone(b.startsAt, "EEE, MMM d 'at' h:mm a", details.timezone);
    const until = formatInTimezone(b.endsAt, "h:mm a", details.timezone);
    return `${b.courtName}: ${when}-${until} (${b.referenceCode})`;
  });
  const text = `Courts booked:\n${lines.join("\n")}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
