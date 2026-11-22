// PF-4c part 2 (AG-1-34): the licence-number typo check. "The licence number SHALL be checked against the format the
// country pack holds for that licensing body, where it holds one (soft warning on mismatch; never a hard block on an
// unusual-but-valid value). An input typo check, not a validity check." The pack is samples/representative-bodies-ca.json
// (PF-6 part 2b); a body's optional `numberPattern` is a regular expression read at that body's own official page, with
// `source: { url, page, quote, date }` beside it (AGENTS rule 4, P-170). Where the page publishes no format, or a lane
// could not read it, the body has no pattern and no number is ever warned about. No validity, expiry or register look-up
// (AG1-D19); no permission reads a licence (SA6-D9). The warning names the body, never the number (AG-1-31).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type LicenceSource = { url: string; page: string; quote: string; date: string };
export type LicensingBody = { name: string; kind: string; numberPattern?: string; source?: LicenceSource };

export const BODIES_FILE = join(import.meta.dirname, "..", "..", "..", "..", "samples", "representative-bodies-ca.json");

const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;
/** A group holding a repeat (+, *, {n,}) that is itself repeated: the shape behind slow regular expressions. */
const NESTED_REPEAT = /\((?:[^()\\]|\\.)*(?:[+*]|\{\d*,\d*\})(?:[^()\\]|\\.)*\)(?:[+*]|\{\d*,\d*\})/;

/** Reads the pack's bodies. A pattern with no complete source, or one that does not compile, stops the load (a pattern
 *  nobody can cite is never used to warn anyone). */
export function bodiesOf(raw: unknown): LicensingBody[] {
  const list = (raw as { bodies?: unknown })?.bodies;
  if (!Array.isArray(list)) throw new Error("samples/representative-bodies-ca.json: no bodies list");
  return list.map((b: { name?: unknown; kind?: unknown; numberPattern?: unknown; source?: Partial<LicenceSource> }) => {
    if (!filled(b?.name) || !filled(b?.kind)) throw new Error("samples/representative-bodies-ca.json: every body needs a name and a kind");
    const body: LicensingBody = { name: String(b.name), kind: String(b.kind) };
    if (b.numberPattern === undefined || b.numberPattern === null) return body;
    const s = b.source;
    if (!filled(b.numberPattern) || !s || !filled(s.url) || !filled(s.page) || !filled(s.quote) || !filled(s.date))
      throw new Error(`samples/representative-bodies-ca.json, ${body.name}: a numberPattern needs its source (url, page, quote, date) from the body's own official page`);
    try { new RegExp(String(b.numberPattern), "u"); } catch { throw new Error(`samples/representative-bodies-ca.json, ${body.name}: the numberPattern does not compile`); }
    // Review m1: a repeated group that itself repeats ("(a+)+") can take seconds on one number; a licence format never
    // needs one, so the pack refuses it.
    if (NESTED_REPEAT.test(String(b.numberPattern))) throw new Error(`samples/representative-bodies-ca.json, ${body.name}: the numberPattern repeats a group that already repeats; write it without nesting`);
    return { ...body, numberPattern: String(b.numberPattern), source: { url: s.url!, page: s.page!, quote: s.quote!, date: s.date! } };
  });
}

export const LICENSING_BODIES: LicensingBody[] = bodiesOf(JSON.parse(readFileSync(BODIES_FILE, "utf8")));

/** The kinds that name exactly one body (the College, the Chambre); a law society is found only by its own name. */
const ONE_BODY_KINDS = new Set(["CICC", "CNQ"]);
const norm = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

/** The pack's body for the words a person saved (its name, in any letter case and spacing, or CICC / CNQ). */
export function bodyNamed(words: string, bodies: LicensingBody[] = LICENSING_BODIES): LicensingBody | undefined {
  const w = norm(words);
  return bodies.find((b) => norm(b.name) === w) ?? bodies.find((b) => ONE_BODY_KINDS.has(b.kind) && norm(b.kind) === w);
}

/** The soft warning for a number that does not match its body's format, or null (no body, no pattern, or a match). The
 *  whole number must match. Never a refusal: the caller always saves. */
export function licenceWarning(body: LicensingBody | undefined, number: string): string | null {
  if (!body?.numberPattern) return null;
  return new RegExp(`^(?:${body.numberPattern})$`, "u").test(number) ? null : `This doesn't look like a ${body.name} licence number. Check it.`;
}
