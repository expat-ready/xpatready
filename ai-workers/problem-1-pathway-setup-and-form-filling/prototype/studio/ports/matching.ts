// The shared duplicate-match rules (FO-9a; P-574 (2): a warning when a key matches: email, phone normalised, or a similar
// name). Pure and `zod` only (case-side contract v0.1 §1 rule 3): front office's match service and the case side's
// PartySearchPort use the same keys, threshold and score. Phone normalisation needs libphonenumber-js, so it lives with
// the adapter (front-office/duplicates/phone.ts); this file only names the shapes.
import { z } from "zod";

/** A similar name is a match at or above this pg_trgm similarity (Sample threshold, BACKLOG FO-9a; no source number). */
export const NAME_THRESHOLD = 0.6;
/** At most this many matches are named in one answer (Sample). */
export const MAX_MATCHES = 10;

/** An email as the match compares it: trimmed and lower-cased, or null when it is not one. */
export function normaliseEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.normalize("NFC").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(e) ? e : null;
}

/** A person's name as the match compares it (the same as the database's fo_sales_person_name): given and family names,
 *  lower-cased, spaces collapsed. Empty when there is no name. */
export function personNameKey(given: unknown, family: unknown): string {
  const part = (x: unknown) => (typeof x === "string" ? x.normalize("NFC") : "");
  return `${part(given)} ${part(family)}`.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Why a record matched: an exact email, an exact E.164 phone, or a name at or above the threshold (its similarity). */
export const MatchReason = z.discriminatedUnion("key", [
  z.strictObject({ key: z.literal("EMAIL") }),
  z.strictObject({ key: z.literal("PHONE") }),
  z.strictObject({ key: z.literal("NAME"), similarity: z.number().min(NAME_THRESHOLD).max(1) }),
]);
export type MatchReason = z.infer<typeof MatchReason>;

/** The score 0-100 (Sample rule): an exact email or phone is 100, a name alone is its similarity × 100, rounded down. */
export function matchScore(reasons: MatchReason[]): number {
  if (reasons.some((r) => r.key === "EMAIL" || r.key === "PHONE")) return 100;
  const name = reasons.find((r) => r.key === "NAME");
  return name && name.key === "NAME" ? Math.floor(name.similarity * 100) : 0;
}

/** What is checked: a person's keys, a company's name, or both (Add a lead, Engage, add contact, the arrival path). */
export const DuplicateCheckIn = z.strictObject({
  givenNames: z.string().max(100).nullish(), familyName: z.string().max(100).nullish(),
  email: z.string().max(254).nullish(), phone: z.string().max(40).nullish(), companyName: z.string().max(200).nullish(),
});
export type DuplicateCheckIn = z.infer<typeof DuplicateCheckIn>;

/** A match the caller may see, with the body that uses the existing record instead of making a new one. */
const PersonMatch = z.strictObject({
  kind: z.literal("PERSON"), personId: z.string().uuid(), name: z.string(), score: z.number().int().min(0).max(100),
  reasons: z.array(MatchReason).min(1), useExisting: z.strictObject({ personId: z.string().uuid() }),
});
const CompanyMatch = z.strictObject({
  kind: z.literal("COMPANY"), companyId: z.string().uuid(), name: z.string(), score: z.number().int().min(0).max(100),
  reasons: z.array(MatchReason).min(1), useExisting: z.strictObject({ companyId: z.string().uuid() }),
});
/** The answer: named matches (strongest first) and how many more matched records the caller may not open (never named). */
export const DuplicateCheckOut = z.strictObject({
  matches: z.array(z.discriminatedUnion("kind", [PersonMatch, CompanyMatch])).max(MAX_MATCHES * 2),
  hidden: z.number().int().min(0),
  hiddenLine: z.string().nullable(),
});
export type DuplicateCheckOut = z.infer<typeof DuplicateCheckOut>;
