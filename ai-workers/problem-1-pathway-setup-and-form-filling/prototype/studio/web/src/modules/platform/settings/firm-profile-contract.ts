// PF-5s S5 (R1.92; AG-01 §3.1, AG01-29(7), AG-1-65): the shape the Firm profile page reads from PF-5fp's `GET|PUT
// /api/platform/firm/profile`, parsed at the edge, and the page's pure helpers. No imports from the app, so a test reads it in Node.
// The server decides every rule (who changes what, each value's format, the version); the page only shows them.
import { z } from "zod";

const Text = z.string().nullable();
export const Profile = z.object({
  firm: z.object({ key: z.string(), legalName: Text, operatingName: z.string(), countryCode: z.string() }),
  details: z.object({ publicPhone: Text, publicEmail: Text, website: Text, language: z.enum(["en", "fr"]), timeZone: z.string(), currency: z.enum(["CAD", "USD"]) }),
  ownerOnly: z.object({ billingEmail: Text, businessAddress: z.unknown().nullable() }),
  canChange: z.object({ details: z.boolean(), ownerOnly: z.boolean() }),
  version: z.string(),
});
export type Profile = z.infer<typeof Profile>;
export const Saved = z.object({ profile: Profile, changed: z.array(z.string()) });

/** Who may open the page: every role holding the settings read (the API's door). */
export const PROFILE_READ_KEY = "agent/settings:list";
/** Who sees the firm's billing record (billing email, business address): those who administer the firm (the API's break m1). */
export const PROFILE_ADMIN_KEY = "agent/settings:edit";

/** The fields the page edits, in the order shown; the body's names. */
export const FIELDS = ["publicPhone", "publicEmail", "website", "language", "timeZone", "currency", "billingEmail"] as const;
export type FieldName = (typeof FIELDS)[number];
export type Form = Record<FieldName, string>;
export const formOf = (p: Profile): Form => ({
  publicPhone: p.details.publicPhone ?? "", publicEmail: p.details.publicEmail ?? "", website: p.details.website ?? "",
  language: p.details.language, timeZone: p.details.timeZone, currency: p.details.currency, billingEmail: p.ownerOnly.billingEmail ?? "",
});
/** The save's body: the version and only the fields this person changed (an unchanged field is never sent, so an Admin's save
 *  never carries the Owner's billing email). The server trims and treats "" as "none" for phone, email and website. */
export function changesOf(start: Form, now: Form, version: string): Record<string, string> {
  const body: Record<string, string> = { version };
  for (const k of FIELDS) if (now[k] !== start[k]) body[k] = now[k];
  return body;
}
export const isDirty = (start: Form, now: Form) => FIELDS.some((k) => start[k] !== now[k]);
/** The 422's field errors by our field names; a field the page does not show (a read-only one) is kept for the notice. */
export const fieldErrors = (fields: Record<string, string> | undefined): Partial<Record<FieldName, string>> =>
  Object.fromEntries(FIELDS.filter((k) => fields?.[k]).map((k) => [k, fields![k]]));
export const otherErrors = (fields: Record<string, string> | undefined) => Object.entries(fields ?? {}).filter(([k]) => !(FIELDS as readonly string[]).includes(k)).map(([, v]) => v);

/** The country's English name from its two-letter code ("CA" → "Canada"). */
export function countryName(code: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code; } catch { return code; }
}
export const LANGUAGES = [{ value: "en", label: "English" }, { value: "fr", label: "French" }] as const;
export const CURRENCIES = [{ value: "CAD", label: "Canadian dollar (CAD)" }, { value: "USD", label: "US dollar (USD)" }] as const;
export const languageWord = (v: string) => LANGUAGES.find((l) => l.value === v)?.label ?? v;
export const currencyWord = (v: string) => CURRENCIES.find((c) => c.value === v)?.label ?? v;

/** The business address in two lines when it has the fields the tax needs (as Plan and billing reads it); else null. */
const Address = z.object({ unit: z.string().nullable().optional(), street_number: z.string(), street_name: z.string(), city: z.string(), province_state: z.string(), postal_code: z.string() }).passthrough();
export function addressLines(v: unknown): string[] | null {
  const r = Address.safeParse(v);
  if (!r.success) return null;
  const a = r.data;
  return [`${a.unit ? `${a.unit}-` : ""}${a.street_number} ${a.street_name}`, `${a.city} ${a.province_state} ${a.postal_code}`];
}

export const WORDS = {
  intro: "Your firm's public contact details and the defaults new work starts with.",
  supportOnly: "Changed by ExpatReady support. Contact support to change these.",
  readOnlyDetails: "Only an Owner or Admin can change these.",
  ownerOnly: "Only the Owner can change this.",
  addressHere: "Change it on Plan and billing, where it is also used for tax.",
  addressMissing: "Not added yet. Needed before your first invoice: we use it to work out tax.",
  conflict: "We've loaded the latest details; make your change again and save.",
  saved: "Firm profile saved.",
  nothing: "No changes to save.",
};
