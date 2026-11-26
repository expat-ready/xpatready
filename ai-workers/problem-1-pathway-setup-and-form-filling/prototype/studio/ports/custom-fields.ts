// PF-22a part 2 (R1.95, map row 95; Doc-1 "per-entity custom fields", ADR C1-2; P-570, P-584 (2)): CustomFieldPort, the
// door through which a module names a record kind it owns (front office: fo_prospect, fo_person, fo_company) and the
// visibility checks the custom-field routes call before reading or writing a value, so a field never shows more than its
// record does. Also the shape rules both sides share: the ten types (Sample, question 8), the limit of active fields per
// kind (Sample, P-562), a field's key made from its label, and each type's value check in plain words. The value check
// mirrors the database's pf_custom_value_ok (migration 20261126063100_shared__pf22a_custom_fields), which stays the last
// word. The registry rule (EntityRegistry) is one class used by the real adapter (api/src/platform/custom-fields/
// registry.ts) and the fake, so the fake can never promise another rule. This folder imports only zod and its own files.
import { z } from "zod";

/** The ten types (Sample set, question 8). */
export const CUSTOM_FIELD_TYPES = ["TEXT", "LONG_TEXT", "NUMBER", "DATE", "SELECT", "MULTI_SELECT", "CHECKBOX", "EMAIL", "PHONE", "URL"] as const;
export const CustomFieldType = z.enum(CUSTOM_FIELD_TYPES);
export type CustomFieldType = z.infer<typeof CustomFieldType>;
/** The types that carry choices. */
export const CHOICE_TYPES: readonly CustomFieldType[] = ["SELECT", "MULTI_SELECT"];
/** At most this many active (not archived) fields per record kind in a firm (Sample, P-562). */
export const CUSTOM_FIELD_LIMIT = 50;
/** The key that adds, edits, orders and archives a firm's fields (Owner and Admin; Sample, question 8). */
export const CUSTOM_FIELD_MANAGE = "agent/custom-field:manage";
/** Lengths the database also keeps (plat_custom_field_shape, pf_custom_value_ok). */
export const LIMITS = { label: 80, key: 40, helpText: 300, choice: 80, choices: 100, text: 500, longText: 5000, email: 254, url: 2000 } as const;

/** A record kind a module registers: a lower-case name (the database's pf_custom_name_ok, 64 characters). */
export const EntityKind = z.string().regex(/^[a-z][a-z0-9_.]*$/).max(64);

// The blanks the database trims (pf_custom_trim: [[:space:]] under pg_c_utf8, which holds U+0085, and the Unicode spaces
// up to U+200B). JS's own trim keeps U+0085 and U+200B (break round 3), so this reads them the database's way.
const BLANK = "\\s\\u0085\\u00a0\\u1680\\u2000-\\u200b\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";
const EDGES = new RegExp(`^[${BLANK}]+|[${BLANK}]+$`, "g");
/** Text trimmed at both ends the way the database trims it, in one spelling (NFC). */
export const trimText = (s: string) => s.normalize("NFC").replace(EDGES, "");
/** The form two choices or labels are compared in: trimmed, NFC, lower case. */
export const sameForm = (s: string) => trimText(s).toLowerCase();

/** A field's key from its label: lower-case letters, digits and "_", starting with a letter, at most 40; "_2", "_3", …
 *  when the key is taken (archived fields keep theirs, so archive-and-re-add gets a new one; challenge M4). */
export function keyFromLabel(label: string, taken: Iterable<string>): string {
  const base = (trimText(label).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(?=[0-9])/, "f_") || "field").slice(0, LIMITS.key);
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) { const k = `${base.slice(0, LIMITS.key - String(n).length - 1)}_${n}`; if (!used.has(k)) return k; }
}

/** The plain words when a field's choices are wrong, or null when they are fine. */
export function choicesIssue(type: CustomFieldType, choices: readonly string[]): string | null {
  if (!CHOICE_TYPES.includes(type)) return choices.length ? "Only a choose-one or choose-several field has choices." : null;
  if (!choices.length) return "Add at least one choice.";
  if (choices.length > LIMITS.choices) return `At most ${LIMITS.choices} choices.`;
  const seen = new Set<string>();
  for (const c of choices) {
    if (c !== trimText(c) || ![...c].length) return "A choice cannot be empty or start or end with a space.";
    if ([...c].length > LIMITS.choice) return `A choice is at most ${LIMITS.choice} characters.`;
    if (seen.has(sameForm(c))) return `“${c}” is already a choice.`;
    seen.add(sameForm(c));
  }
  return null;
}

const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const EMAIL = /^[^@\s<>()[\],;:"\\]+@[A-Za-z0-9][^@\s<>()[\],;:"\\]*\.[^@\s<>()[\],;:"\\.]+$/;
const PHONE = /^\+?[0-9(][0-9 ().-]{3,29}$/;
const URL_ = /^https?:\/\/[a-z0-9][^\s]*$/i;

/** One field as the value check reads it. */
export type FieldShape = { type: CustomFieldType; options: readonly string[]; label: string };

/** A value as stored (a string, a number, true or false, or a list of choices), or the plain words that say what to fix.
 *  Text is trimmed; empty text, an empty list and null mean "no value" (`{ value: null }`: the row is removed). */
export function readValue(f: FieldShape, raw: unknown): { value: string | number | boolean | string[] | null } | { issue: string } {
  if (raw === null || raw === undefined) return { value: null };
  switch (f.type) {
    case "CHECKBOX": return typeof raw === "boolean" ? { value: raw } : { issue: "Choose yes or no." };
    case "NUMBER": {
      const n = typeof raw === "string" && /^-?[0-9]+(\.[0-9]+)?$/.test(raw.trim()) ? Number(raw.trim()) : raw;
      if (typeof raw === "string" && !raw.trim()) return { value: null };
      return typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e15 ? { value: n } : { issue: "Type a number, for example 2500 or 2500.50." };
    }
    case "MULTI_SELECT": {
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) return { issue: `Choose from the listed choices for ${f.label}.` };
      const picked = [...new Set((raw as string[]).map(trimText))].filter(Boolean);
      if (!picked.length) return { value: null };
      return picked.every((p) => f.options.includes(p)) ? { value: picked } : { issue: `Choose from the listed choices for ${f.label}.` };
    }
  }
  if (typeof raw !== "string") return { issue: `Type text for ${f.label}.` };
  const s = trimText(raw);
  if (!s) return { value: null };
  const n = [...s].length;
  switch (f.type) {
    case "TEXT": return n <= LIMITS.text ? { value: s } : { issue: `At most ${LIMITS.text} characters.` };
    case "LONG_TEXT": return n <= LIMITS.longText ? { value: s } : { issue: `At most ${LIMITS.longText} characters.` };
    case "SELECT": return f.options.includes(s) ? { value: s } : { issue: `Choose one of the listed choices for ${f.label}.` };
    case "EMAIL": return n <= LIMITS.email && EMAIL.test(s) && !s.includes("..") ? { value: s } : { issue: "Type an email like name@example.com." };
    case "PHONE": { const d = s.replace(/[^0-9]/g, "").length; return PHONE.test(s) && d >= 4 && d <= 20 ? { value: s } : { issue: "Type a phone number with its area code, for example 416 555 0142." }; }
    case "URL": { const u = /^https?:\/\//i.test(s) ? s : `https://${s}`; return [...u].length <= LIMITS.url && URL_.test(u) ? { value: u } : { issue: "Type a web address, for example example.com." }; }
    case "DATE": {
      const d = DATE.test(s) ? new Date(`${s}T00:00:00Z`) : null;
      return d && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? { value: s } : { issue: "Pick a real date, for example 2026-12-15." };
    }
    default: return { issue: `Type a value for ${f.label}.` };
  }
}

/** Who asks: the signed-in staff member (PF-4's StaffContext carries these and more). */
export type CustomFieldCaller = { firmId: string; staffId: string; keys: readonly string[] };
/** A module's checks for one record kind: may this person see the record (else its values are a 404), and change it. */
export type EntityAccess<C extends CustomFieldCaller = CustomFieldCaller> = {
  canView(ctx: C, id: string): Promise<boolean>;
  canEdit(ctx: C, id: string): Promise<boolean>;
};

export interface CustomFieldPort<C extends CustomFieldCaller = CustomFieldCaller> {
  /** A module names a record kind it owns, once (a second registration of the kind is refused). */
  registerEntity(kind: string, access: EntityAccess<C>): void;
  /** The registered kinds, in order. */
  kinds(): string[];
  /** A kind's checks, or undefined when no module registered it (the routes answer 400). */
  accessOf(kind: string): EntityAccess<C> | undefined;
}

/** The registry rule, shared by the real adapter and the fake. */
export class EntityRegistry<C extends CustomFieldCaller = CustomFieldCaller> implements CustomFieldPort<C> {
  private readonly entities = new Map<string, EntityAccess<C>>();
  registerEntity(kind: string, access: EntityAccess<C>): void {
    EntityKind.parse(kind);
    if (this.entities.has(kind)) throw new Error(`CustomFieldPort: ${kind} is already registered`);
    if (typeof access?.canView !== "function" || typeof access?.canEdit !== "function") throw new Error(`CustomFieldPort: ${kind} needs canView and canEdit`);
    this.entities.set(kind, access);
  }
  kinds(): string[] { return [...this.entities.keys()]; }
  accessOf(kind: string): EntityAccess<C> | undefined { return this.entities.get(kind); }
}

/** The fake: the same rule, nothing registered at first. */
export const fakeCustomFields = <C extends CustomFieldCaller = CustomFieldCaller>(): CustomFieldPort<C> => new EntityRegistry<C>();
