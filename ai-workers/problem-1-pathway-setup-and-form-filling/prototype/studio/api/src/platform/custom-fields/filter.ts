// PF-22v (R1.95; AG-2-23 rule 1 and "invalid filter data"; PF-22s concept BR-16; challenge B1): a list filters by a
// firm's custom field. The filter language is the list's own query string (the same words a saved view stores):
// `cf.<key>=<value>`, by type:
//   SELECT, MULTI_SELECT: is any of (repeat the key, or one value): cf.referral_partner=Maple Law;
//   TEXT, LONG_TEXT, EMAIL, PHONE, URL: contains (any case): cf.notes=visa;
//   NUMBER, DATE: between, either end open: cf.budget=1000..5000, cf.follow_up=2026-12-01.. (a single value: equal);
//   CHECKBOX: yes or no: cf.vip=true or cf.vip=false (a record left empty is neither: it has no answer).
// `customFieldQuery` is the zod rule a list's query schema takes for its cf.* keys (an unknown key that is not cf.* is
// refused, named, as every strict query is: PF-28); `customFieldIdsWhere` turns the asked values into the ids of the
// records that match, in the caller's firm, reading only active fields (an archived field is no filter). The list then
// narrows inside its own visibility, so a filter never widens what a person sees. Only the platform reads plat_custom_*.
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { readValue, storable, trimText, type CustomFieldType } from "../../../../ports/custom-fields.ts";
import { firmScope } from "../firm-scope.ts";
import { FIELD_ERROR_STATUS } from "../http/input.ts";
import { problem } from "../identity/keys.ts";

type Tx = Prisma.TransactionClient;
/** A custom-field query key. */
/** The most records a custom-field filter may match before it must be narrowed. */
export const MAX_MATCHES = 30000;
export const CF_KEY = /^cf\.[a-z][a-z0-9_]{0,39}$/;
const cfText = z.string().max(500).refine(storable, "Use letters, digits and punctuation only.");   // no NUL: never a 500 (break m1)
const cfValue = z.union([cfText, z.array(cfText).max(100)]);
/** A list's query schema with its cf.* keys: the named keys as given, cf.* keys as text or a list, any other key refused. */
export function customFieldQuery<S extends z.ZodRawShape>(shape: S) {
  return z.object(shape).catchall(cfValue).superRefine((q, c) => {
    for (const k of Object.keys(q)) if (!Object.hasOwn(shape, k) && !CF_KEY.test(k))   // own keys only: "constructor" is no query word (break m2)
      c.addIssue({ code: "custom", path: [k], message: "This field is not allowed here." });
  });
}
/** The cf.* part of a parsed query, by field key. */
export const cfPart = (q: Record<string, unknown>): Record<string, string[]> =>
  Object.fromEntries(Object.entries(q).filter(([k, v]) => CF_KEY.test(k) && v !== undefined).map(([k, v]) => [k.slice(3), (Array.isArray(v) ? v : [v]).map(String)]));

const refuse = (fields: Record<string, string>): never =>
  problem(FIELD_ERROR_STATUS, "Check the filter", `${Object.values(fields).join(" ")}`.slice(0, 600), { code: "INVALID_FILTER", fields });
const range = (s: string) => { const m = /^(.*?)\.\.(.*)$/.exec(s);   // the first ".." splits, so 2500.75 is one number (review M5)
  return m ? [m[1].trim(), m[2].trim()] as const : [s.trim(), s.trim()] as const; };

/** One field's condition as SQL on plat_custom_value v, or the plain words when the asked value does not fit the field. */
function condition(f: { label: string; type: CustomFieldType; options: string[] }, asked: string[]): Prisma.Sql | string {
  const shape = { type: f.type, options: f.options, label: f.label };
  switch (f.type) {
    case "SELECT": case "MULTI_SELECT": {
      const picked = asked.map(trimText).filter(Boolean);
      if (!picked.length || picked.some((p) => !f.options.includes(p))) return `Choose from the listed choices for ${f.label}.`;
      return f.type === "SELECT" ? Prisma.sql`(v.value #>> '{}') = any(${picked}::text[])` : Prisma.sql`v.value ?| ${picked}::text[]`;
    }
    case "CHECKBOX": {
      const s = asked.length === 1 ? asked[0].trim().toLowerCase() : "";
      return s === "true" || s === "yes" ? Prisma.sql`v.value = 'true'::jsonb` : s === "false" || s === "no" ? Prisma.sql`v.value = 'false'::jsonb` : `Choose yes or no for ${f.label}.`;
    }
    case "NUMBER": case "DATE": {
      if (asked.length !== 1) return `One range for ${f.label}, like 1000..5000.`;
      const [lo, hi] = range(asked[0]);
      if (!lo && !hi) return `Give at least one end for ${f.label}.`;
      const ends = [lo, hi].map((e) => (e ? readValue(shape, f.type === "NUMBER" ? Number(e) : e) : { value: null }));
      const bad = ends.find((e) => "issue" in e);
      if (bad && "issue" in bad) return bad.issue;
      const [a, b] = ends.map((e) => ("value" in e ? e.value : null));
      if (f.type === "NUMBER") return Prisma.sql`(${a === null ? Prisma.sql`true` : Prisma.sql`(v.value #>> '{}')::numeric >= ${a}::numeric`} and ${b === null ? Prisma.sql`true` : Prisma.sql`(v.value #>> '{}')::numeric <= ${b}::numeric`})`;
      return Prisma.sql`(${a === null ? Prisma.sql`true` : Prisma.sql`(v.value #>> '{}') >= ${a}`} and ${b === null ? Prisma.sql`true` : Prisma.sql`(v.value #>> '{}') <= ${b}`})`;
    }
    default: {
      const s = asked.length === 1 ? trimText(asked[0]) : "";
      if (!s || [...s].length > 200) return `Type 1 to 200 characters to look for in ${f.label}.`;
      return Prisma.sql`(v.value #>> '{}') ilike ${`%${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`}`;
    }
  }
}

/** The ids of the records of `kind` that match every asked field, or null when nothing was asked. A key that names no
 *  active field, or a value that does not fit its field, is refused 422 (INVALID_FILTER, the cf.<key> named). */
export async function customFieldIdsWhere(db: Tx | PrismaClient, firmIdRaw: string, kind: string, asked: Record<string, string[]>): Promise<string[] | null> {
  const keys = Object.keys(asked);
  if (!keys.length) return null;
  const firmId = firmScope(firmIdRaw).firmId;
  const fields = await db.platCustomField.findMany({ where: firmScope(firmId, { entityKind: kind, archivedAt: null, key: { in: keys } }), select: { id: true, key: true, label: true, type: true, options: true } });
  const errors: Record<string, string> = {}, parts: { id: string; sql: Prisma.Sql }[] = [];
  for (const k of keys) {
    const f = fields.find((x) => x.key === k);
    if (!f) { errors[`cf.${k}`] = "No such field here (it may have been archived)."; continue; }
    const c = condition({ label: f.label, type: f.type, options: Array.isArray(f.options) ? (f.options as string[]) : [] }, asked[k]);
    if (typeof c === "string") errors[`cf.${k}`] = c;
    else parts.push({ id: f.id, sql: c });
  }
  if (Object.keys(errors).length) refuse(errors);
  let ids: Set<string> | null = null;
  for (const p of parts) {
    const rows = await db.$queryRaw<{ id: string }[]>`select v.entity_id::text as id from plat_custom_value v where v.firm_id = ${firmId}::uuid and v.field_id = ${p.id}::uuid and ${p.sql}`;
    const got: Set<string> = new Set(rows.map((r) => r.id));
    ids = ids === null ? got : new Set([...ids].filter((x) => got.has(x)));
  }
  // A list reads at most 500 rows; an id list past the database's parameter limit would fail, so a filter that matches
  // more is refused in words (break m4: never a 500).
  if (ids && ids.size > MAX_MATCHES) refuse(Object.fromEntries(keys.map((k) => [`cf.${k}`, "This filter matches too many records. Add another filter to narrow it."])));
  return [...(ids ?? [])];
}
