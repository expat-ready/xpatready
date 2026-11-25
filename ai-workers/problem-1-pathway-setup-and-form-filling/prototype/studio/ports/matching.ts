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

/** A person's name as the match compares it, the same rule as the database's fo_sales_name_key (FO-9a's migration; the
 *  test pins them equal): decomposed (NFKD) and lower-cased, accents folded (U+0300-036F dropped), every other letter outside a-z and 0-9
 *  spelled 0 + its code point in hex, invisible and format marks dropped, punctuation as a space, spaces collapsed.
 *  "José García" → "jose garcia"; "李明" → "0674e0660e". A key with a digit matches only exactly (hex digits are shared by
 *  unrelated letters), so pg_trgm compares Latin-letter names only. Empty when there is no name. */
export function personNameKey(given: unknown, family: unknown): string {
  const part = (x: unknown) => (typeof x === "string" ? x : "");
  const s = `${part(given)} ${part(family)}`.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f-\u1160\u17b4-\u17b5\u180b-\u180f\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g, "");
  let out = "";
  for (const ch of s) { const c = ch.codePointAt(0)!; out += /^[a-z0-9]$/.test(ch) ? ch : c > 127 && !/^\s$/.test(ch) ? `0${c.toString(16)}` : " "; }
  return out.replace(/ +/g, " ").trim();
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

/** One line of text: at most `max` characters (code points, as FO-2's fields count them, break B8), no control mark
 *  (a null byte would be the database's error, break B7). */
const line = (max: number) => z.string().refine((v) => [...v.normalize("NFC")].length <= max, `at most ${max} characters.`).refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "one line, no control characters.").nullish();
/** What is checked: a person's keys, a company's name, or both (Add a lead, Engage, add contact, the arrival path). */
export const DuplicateCheckIn = z.strictObject({
  givenNames: line(100), familyName: line(100), email: line(254), phone: line(40), companyName: line(200),
});
export type DuplicateCheckIn = z.infer<typeof DuplicateCheckIn>;

/** A match the caller may see, with the body that uses the existing record instead of making a new one. */
const PersonMatch = z.strictObject({
  kind: z.literal("PERSON"), personId: z.string().uuid(), name: z.string(), score: z.number().int().min(0).max(100),
  reasons: z.array(MatchReason).min(1), useExisting: z.strictObject({ personId: z.string().uuid() }),
  /** FO-9s (break F2): the number of the newest lead of this person the caller may open, so two people with one name are
   *  told apart (as Add a lead's 409 names them). Optional: additive. */
  lead: z.string().nullable().optional(),
});
const CompanyMatch = z.strictObject({
  kind: z.literal("COMPANY"), companyId: z.string().uuid(), name: z.string(), score: z.number().int().min(0).max(100),
  reasons: z.array(MatchReason).min(1), useExisting: z.strictObject({ companyId: z.string().uuid() }),
});
/** The answer: named matches (strongest first), and whether a record the caller may not open also matched (1 or 0: never
 *  how many, never named). */
export const DuplicateCheckOut = z.strictObject({
  matches: z.array(z.discriminatedUnion("kind", [PersonMatch, CompanyMatch])).max(MAX_MATCHES * 2),
  hidden: z.number().int().min(0).max(1),
  hiddenLine: z.string().nullable(),
});
export type DuplicateCheckOut = z.infer<typeof DuplicateCheckOut>;
