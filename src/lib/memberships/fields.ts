import { z } from "zod";

// Dynamic, per-tier membership fields. A tier (membership_plans row) carries a declarative spec of the
// extra details it collects at signup (emergency contact, address, spouse, …); the member signup form
// is generated from that spec, and the submitted values are validated against it and snapshotted onto
// the request. Modelled on the promotions engine's `formFields` pattern (src/lib/promos). Identity
// fields (name, email, contact) come from the profile and are NOT custom fields.

export const FIELD_KINDS = ["text", "email", "phone", "textarea", "date", "select"] as const;
export type MembershipFieldKind = (typeof FIELD_KINDS)[number];

export const FIELD_KIND_LABELS: Record<MembershipFieldKind, string> = {
  text: "Short text",
  email: "Email",
  phone: "Phone",
  textarea: "Long text",
  date: "Date",
  select: "Choice",
};

export const membershipFieldSpecSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Field keys use lowercase letters, numbers and underscores."),
  label: z.string().trim().min(1).max(80),
  kind: z.enum(FIELD_KINDS),
  required: z.boolean().default(false),
  // Only meaningful for the "select" kind.
  options: z
    .array(z.object({ value: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(80) }))
    .max(30)
    .optional(),
});
export type MembershipFieldSpec = z.infer<typeof membershipFieldSpecSchema>;

export const membershipFieldsSchema = z.array(membershipFieldSpecSchema).max(30).default([]);

/** Defensive parse of the jsonb `fields` column into typed specs (drops anything malformed). */
export function parseFieldSpecs(raw: unknown): MembershipFieldSpec[] {
  const res = membershipFieldsSchema.safeParse(raw ?? []);
  return res.success ? res.data : [];
}

/** Turn a human label into a stable config key (used by the admin editor when a field is added). */
export function slugifyFieldKey(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "field"
  );
}

/** A captured value, snapshotted with its label so the request record is self-contained and survives a
 * later change to the tier's field spec. */
export interface CapturedDetail {
  key: string;
  label: string;
  value: string;
}

const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate submitted values against a tier's field specs and snapshot them (label + value) for the
 * request record. Pure, so the client can run it for inline UX and the server for the authoritative
 * check — same split as the promo engine. */
export function validateMembershipDetails(
  specs: MembershipFieldSpec[],
  values: Record<string, unknown>
): { ok: true; details: CapturedDetail[] } | { ok: false; error: string } {
  const details: CapturedDetail[] = [];
  for (const f of specs) {
    const raw = typeof values[f.key] === "string" ? (values[f.key] as string).trim() : "";
    if (raw === "") {
      if (f.required) return { ok: false, error: `${f.label} is required.` };
      continue; // optional + blank → not captured
    }
    if (raw.length > 1000) return { ok: false, error: `${f.label} is too long.` };
    if (f.kind === "email" && !EMAIL_RE.test(raw)) return { ok: false, error: `Enter a valid email for ${f.label}.` };
    if (f.kind === "phone" && !PHONE_RE.test(raw)) return { ok: false, error: `Enter a valid number for ${f.label}.` };
    if (f.kind === "date" && !DATE_RE.test(raw)) return { ok: false, error: `Enter a valid date for ${f.label}.` };
    if (f.kind === "select" && !(f.options ?? []).some((o) => o.value === raw))
      return { ok: false, error: `Choose a valid option for ${f.label}.` };
    details.push({ key: f.key, label: f.label, value: raw });
  }
  return { ok: true, details };
}

/** Defensive parse of the jsonb `details` column into captured values for display. */
export function parseCapturedDetails(raw: unknown): CapturedDetail[] {
  const schema = z.array(z.object({ key: z.string(), label: z.string(), value: z.string() }));
  const res = schema.safeParse(raw ?? []);
  return res.success ? res.data : [];
}
