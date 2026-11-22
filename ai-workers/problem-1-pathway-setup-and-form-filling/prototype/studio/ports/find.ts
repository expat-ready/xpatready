// PF-30a (BACKLOG row PF-30a, batch 5: one find door; map row 102, P-586; AG-7-75 rule 3, AG-7-88 rules 1, 4-5, 7):
// FindPort, the one find door every module registers its finder on. `GET /api/platform/find?q=` runs every registered
// finder at once, each within FIND_BUDGET_MS (a slow or failing module is dropped and the answer says PARTIAL_LINE), and
// merges up to FIND_MAX_HITS hits grouped by kind. Each finder applies its own area's view rule; the door adds none. The
// query is read once here through ports/matching.ts (an email lower-cased, a name as its name key, a file number upper-cased);
// a phone stays as typed, because E.164 needs the firm's country and libphonenumber-js (ports/ is zod only), so the
// finder reads it with its own adapter (FO-9a's front-office/duplicates/phone.ts). The answer never repeats the query
// and nothing here logs it (PF-23). The file is the port, its run rule (shared by the real registry and the fake, so the
// fake can never promise another merge) and `fakeFind()`. This folder imports only zod and its own files.
import { z } from "zod";
import { normaliseEmail, personNameKey } from "./matching.ts";

/** Each finder's budget (BACKLOG PF-30a): a finder slower than this is dropped from the answer. */
export const FIND_BUDGET_MS = 400;
/** At most this many hits from one finder (BACKLOG PF-30a). */
export const FINDER_MAX_HITS = 8;
/** At most this many hits in one answer (BACKLOG PF-30a). */
export const FIND_MAX_HITS = 20;
/** The words when a finder was dropped (BACKLOG PF-30a). */
export const PARTIAL_LINE = "Some results could not be loaded";

/** The text typed: trimmed, 2-100 characters counted as characters, not UTF-16 units (BACKLOG PF-30a); shorter or longer is refused (the route answers 400). */
export const FindText = z.string().trim().refine((v) => [...v].length >= 2 && [...v].length <= 100, "2 to 100 characters");

/** The query as every finder reads it, made once by `findQueryOf`. */
export type FindQuery = {
  /** The trimmed text, for a finder's own exact or prefix reading. Never logged, never echoed. */
  text: string;
  /** The text as an email (trimmed, lower-cased), or null when it is not one. */
  email: string | null;
  /** The text as a person's name key (matching.ts personNameKey), or "" when it holds no name. */
  nameKey: string;
  /** The text when it looks like a phone number (7-15 digits, with only + ( ) . - and spaces), else null. */
  phone: string | null;
  /** The text upper-cased with no spaces when it looks like a file number (letters, a dash, digits: "p-00012" → "P-00012"), else null. */
  number: string | null;
};

const PHONE_LIKE = /^\+?[0-9\s().-]+$/;
const NUMBER_LIKE = /^[A-Za-z]{1,6}-?[0-9]{1,10}(-[0-9]{1,8}){0,2}$/;

/** Reads the typed text once (refuses what FindText refuses). */
export function findQueryOf(raw: unknown): FindQuery {
  const text = FindText.parse(raw);
  const digits = text.replace(/[^0-9]/g, "");
  const compact = text.replace(/\s+/g, "");
  const number = NUMBER_LIKE.test(compact) ? compact.toUpperCase().replace(/^([A-Z]+)(?=[0-9])/, "$1-") : null;
  return {
    text,
    email: normaliseEmail(text),
    // at least 2 letters or digits, so "a." or "a%" is no 1-letter search (breaker m1)
    nameKey: text.includes("@") ? "" : ((k) => (k.replace(/ /g, "").length >= 2 ? k : ""))(personNameKey(text, "")),
    phone: PHONE_LIKE.test(text) && digits.length >= 7 && digits.length <= 15 ? text : null,
    number,
  };
}

/** Why a hit matched. */
export const FindMatchedOn = z.enum(["NAME", "EMAIL", "PHONE", "NUMBER"]);
/** One hit: what it is, its id, the words shown, why it matched, and the app page that opens it. */
export const FindHit = z.strictObject({
  kind: z.string().regex(/^[a-z][a-z_]{0,29}$/),
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).nullable(),
  matched_on: z.array(FindMatchedOn).min(1).max(4),
  url: z.string().regex(/^\/[A-Za-z0-9/_?=&.-]{0,300}$/),
});
export type FindHit = z.infer<typeof FindHit>;
/** The answer: hits grouped by kind (in the order the finders were registered), and the partial-results line when a finder was dropped. */
export const FindResult = z.strictObject({
  groups: z.array(z.strictObject({ kind: FindHit.shape.kind, hits: z.array(FindHit).min(1) })),
  partial: z.boolean(),
  message: z.literal(PARTIAL_LINE).nullable(),
});
export type FindResult = z.infer<typeof FindResult>;

/** Who asks: the signed-in staff member's session (PF-4's StaffContext carries these and more). */
export type FindCaller = { firmId: string; staffId: string; keys: readonly string[] };
/** A module's finder: its hits for this caller and query, at most FINDER_MAX_HITS, only records the caller may open. */
export type Finder<C extends FindCaller = FindCaller> = (ctx: C, query: FindQuery) => Promise<FindHit[]>;

export interface FindPort<C extends FindCaller = FindCaller> {
  /** Adds a module's finder; a module registers once (a second registration under the same name is refused). */
  register(module: string, finder: Finder<C>): void;
  /** Runs every finder at once for the caller; refuses a text FindText refuses. */
  find(ctx: C, text: unknown): Promise<FindResult>;
}

/** The run rule both the registry and the fake use: every finder at once, each within `budgetMs`; a slow, failing or
 *  ill-shaped finder is dropped (never its error's words: they could quote the query); at most FINDER_MAX_HITS from
 *  each, at most FIND_MAX_HITS in all, in registration order, grouped by kind. */
/** Why a finder was dropped: the module and a reason word only, never the error's words (they could quote the query). */
export type FindDrop = { module: string; reason: "TIMEOUT" | "ERROR" | "SHAPE" };
export async function runFinders<C extends FindCaller>(finders: ReadonlyArray<readonly [string, Finder<C>]>, ctx: C, text: unknown, budgetMs = FIND_BUDGET_MS, onDrop?: (d: FindDrop) => void): Promise<FindResult> {
  const query = findQueryOf(text);
  const runs = await Promise.all(finders.map(async ([module, finder]) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), budgetMs); });
    try {
      const got = await Promise.race([finder(ctx, query).then((h) => { const r = z.array(FindHit).safeParse(h); if (!r.success) throw new ShapeError(); return r.data; }), late]);
      if (got === null) onDrop?.({ module, reason: "TIMEOUT" });
      return got;
    } catch (e) {
      onDrop?.({ module, reason: e instanceof ShapeError ? "SHAPE" : "ERROR" });
      return null;
    } finally { clearTimeout(timer); }
  }));
  const hits = runs.flatMap((r) => (r ?? []).slice(0, FINDER_MAX_HITS)).slice(0, FIND_MAX_HITS);
  const groups: FindResult["groups"] = [];
  for (const h of hits) {
    const g = groups.find((x) => x.kind === h.kind);
    if (g) g.hits.push(h); else groups.push({ kind: h.kind, hits: [h] });
  }
  const partial = runs.some((r) => r === null);
  return { groups, partial, message: partial ? PARTIAL_LINE : null };
}

class ShapeError extends Error {}

/** The module name a finder registers under. */
export const FindModule = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);

/** The fake: the same run rule over the finders a test registers (none at first). */
export function fakeFind<C extends FindCaller = FindCaller>(budgetMs = FIND_BUDGET_MS): FindPort<C> & { modules(): string[] } {
  const finders: [string, Finder<C>][] = [];
  return {
    register(module, finder) {
      FindModule.parse(module);
      if (finders.some(([m]) => m === module)) throw new Error(`FindPort: ${module} has already registered its finder`);
      finders.push([module, finder]);
    },
    find: (ctx, text) => runFinders(finders, ctx, text, budgetMs),
    modules: () => finders.map(([m]) => m),
  };
}
