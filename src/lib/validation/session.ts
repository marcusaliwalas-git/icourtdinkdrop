import { z } from "zod";

// The two formats the rotation engine can drive — players cycle on and off shared courts.
// Clinics/tournaments are a different shape and aren't run from the host board.
export const SESSION_FORMATS = ["challenge_court", "open_play"] as const;
export type SessionFormat = (typeof SESSION_FORMATS)[number];

export const SESSION_FORMAT_LABELS: Record<SessionFormat, string> = {
  challenge_court: "Challenge court",
  open_play: "Open play",
};

// A <input type="datetime-local"> value: wall-clock in the venue's timezone, no offset.
// The action resolves it to a timestamptz using the venue's zone.
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time.");

export const sessionSchema = z.object({
  venueId: z.uuid(),
  title: z.string().trim().min(1, "Give the session a title.").max(120),
  description: z.string().trim().max(500).optional(),
  format: z.enum(SESSION_FORMATS).default("challenge_court"),
  startsAtLocal: localDateTime,
  endsAtLocal: localDateTime,
  capacity: z.number().int().min(1, "Capacity must be at least 1.").max(200),
  priceCents: z.number().int().min(0).default(0),
  courtIds: z.array(z.uuid()).min(1, "Pick at least one court."),
  hostId: z.uuid().nullable().optional(),
});

export type SessionInput = z.infer<typeof sessionSchema>;
