import { z } from "zod";

export const venueSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).optional(),
  timezone: z.string().trim().min(1).default("Asia/Manila"),
  contact: z.string().trim().max(120).optional(),
  minLeadMinutes: z.number().int().min(0).max(1440).default(60),
  maxAdvanceDays: z.number().int().min(1).max(180).default(14),
  cancellationCutoffHours: z.number().int().min(0).max(168).default(3),
});

export type VenueInput = z.infer<typeof venueSchema>;

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
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export type OperatingHoursInput = z.infer<typeof operatingHoursSchema>;

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
