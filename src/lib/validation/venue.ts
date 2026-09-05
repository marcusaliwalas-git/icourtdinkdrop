import { z } from "zod";

const mediaType = z.enum(["image", "video"]).optional().or(z.literal(""));

export const venueSchema = z.object({
  name: z.string().trim().min(1).max(120),
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  heroHeading: z.string().trim().max(200).optional().or(z.literal("")),
  heroSubheading: z.string().trim().max(600).optional().or(z.literal("")),
  heroMediaUrl: z.string().trim().max(500).optional().or(z.literal("")),
  heroMediaType: mediaType,
  address: z.string().trim().max(300).optional(),
  timezone: z.string().trim().min(1).default("Asia/Manila"),
  contact: z.string().trim().max(120).optional(),
  // Sender address for this venue's emails — must be on a domain you've verified in Resend.
  emailFrom: z.email("Enter a valid sender email, e.g. bookings@yourvenue.com").optional().or(z.literal("")),
  minLeadMinutes: z.number().int().min(0).max(1440).default(60),
  maxAdvanceDays: z.number().int().min(1).max(180).default(14),
  cancellationCutoffHours: z.number().int().min(0).max(168).default(3),
});

export type VenueInput = z.infer<typeof venueSchema>;

export const venueSectionSchema = z.object({
  venueId: z.uuid(),
  title: z.string().trim().max(200).optional().or(z.literal("")),
  body: z.string().trim().max(5000).optional().or(z.literal("")),
  mediaUrl: z.string().trim().max(500).optional().or(z.literal("")),
  mediaType: mediaType,
  mediaSize: z.enum(["small", "medium", "large", "original"]).optional().or(z.literal("")),
  sortOrder: z.number().int().default(0),
  isVisible: z.boolean().default(true),
});

export type VenueSectionInput = z.infer<typeof venueSectionSchema>;

export const courtSchema = z.object({
  venueId: z.uuid(),
  name: z.string().trim().min(1).max(60),
  surface: z.string().trim().max(60).optional(),
  isIndoor: z.boolean().default(false),
  hourlyRateCents: z.number().int().min(0),
  memberRateCents: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
});

export type CourtInput = z.infer<typeof courtSchema>;

export const operatingHoursSchema = z.object({
  venueId: z.uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  // A native <input type="time"> can't hold "24:00" (the HTML spec caps it at 23:59), so an
  // admin picking midnight to mean "open until the end of the day" submits "00:00" — the one
  // closeTime value that's otherwise meaningless here, since the DB check (close_time >
  // open_time) rejects it outright. Treat it as shorthand for "24:00", which Postgres's `time`
  // type does support and which the app's minute-based math already treats as end-of-day.
  closeTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .transform((t) => (t === "00:00" ? "24:00" : t)),
  // Overnight hours: the close time lands on the following calendar day (e.g. open 18:00,
  // close 02:00, closesNextDay). When set, close may be earlier than open.
  closesNextDay: z.boolean().default(false),
});

export type OperatingHoursInput = z.infer<typeof operatingHoursSchema>;

export const operatingHoursUpdateSchema = operatingHoursSchema.omit({ venueId: true });

export type OperatingHoursUpdateInput = z.infer<typeof operatingHoursUpdateSchema>;

export const paymentAccountSchema = z.object({
  venueId: z.uuid(),
  bankName: z.string().trim().min(1, "Enter the bank or e-wallet name.").max(120),
  accountName: z.string().trim().min(1, "Enter the account name.").max(120),
  accountNumber: z.string().trim().min(1, "Enter the account number.").max(60),
  remarks: z.string().trim().max(300).optional().or(z.literal("")),
  qrUrl: z.string().trim().max(500).optional().or(z.literal("")),
  sortOrder: z.number().int().default(0),
});

export type PaymentAccountInput = z.infer<typeof paymentAccountSchema>;

export const paymentAccountUpdateSchema = paymentAccountSchema.omit({ venueId: true });

export type PaymentAccountUpdateInput = z.infer<typeof paymentAccountUpdateSchema>;

export const closureSchema = z.object({
  venueId: z.uuid(),
  courtId: z.uuid().nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().max(200).optional(),
});

export type ClosureInput = z.infer<typeof closureSchema>;

export const ratePeriodSchema = z.object({
  courtId: z.uuid(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  hourlyRateCents: z.number().int().min(0),
  memberRateCents: z.number().int().min(0).optional(),
});

export type RatePeriodInput = z.infer<typeof ratePeriodSchema>;
