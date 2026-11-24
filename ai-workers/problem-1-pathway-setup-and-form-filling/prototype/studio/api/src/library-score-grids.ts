// AS-1g (R1.106; AG-3-5, AG-3-6, AG-3-7, AG-3-17, AG-3-18, AG-3-19; BR-1 to BR-3; P-577, AGENTS rule 4): score grids
// as cited data. A grid comes as one JSON file (samples/score-grids/README.md): a ruleset, its factors and bands, and its
// language conversion table; every row carries source_ref {url, section, quote, date} or "Sample". It enters the library
// through the configurator's one guarded change (P-253): the author proposes the file (checked whole here, nothing written),
// a second person approves on To review (never the proposer), and the approval writes the grid tables on the named bypass
// use (the app role may only read them, P-588 (1)). Each combination the grid names carries it in its next release's
// snapshot (engine/snapshot.ts score_grids), whose fingerprint then changes; a pinned case keeps its release's copy.
// No authoring screen (AG-03: pack authoring UI is Phase 2). No score value lives in code: grids are data. No AI (US$0).
//   GET  /api/library/score-grids          { grids: [{ key, label, selection_model, combinations, sha256, factors, sample }] }
//   POST /api/library/score-grids          { grid: <the file's JSON>, reason } → the waiting change
import { Body, Controller, Get, Headers, HttpException, Inject, Injectable, Post, type OnModuleInit } from "@nestjs/common";
import type { LibraryChange, Prisma } from "@prisma/client";
import { z } from "zod";
import { canonical, sha256 } from "../../../contracts/rules.ts";
import { actorOf, Audit, Db, need, readerOf, Workspace, type Actor } from "./core.ts";
import { APPROVAL_HOOKS } from "./lifecycle.ts";
import { asBypass, touchPlatform } from "./platform/firm-scope.ts";
import { SCORE_GRIDS_APPLY } from "./library-score-grids.bypass.ts";
import { GRID_INCLUDE, gridWords, snapGrid, type SnapGrid } from "../../engine/score-grids.ts";
import { INVISIBLE, UNSTORABLE } from "../../contracts/documents.ts";

type H = string | undefined;
type Tx = Prisma.TransactionClient;
export const GRID_KIND = "score_grid", GRID_ACTION = "SET_SCORE_GRID";
/** One import of a key waits at a time; a returned one, or an approved one no release has carried, is replaced by the
 *  next import of its key (review B1, breaker M1/M2: never a key locked for good). */
const REPLACED = ["RETURNED"];   // review r2 M1: an approved one is replaced only when the next one is applied (apply)
const problem = (status: number, title: string, detail: string, extra: Record<string, unknown> = {}) =>
  new HttpException({ type: `https://expatready.local/problems/${title.toLowerCase().replace(/[^a-z]+/g, "-")}`, title, status, detail, ...extra }, status);
const KEY = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

// Breaker M5, m2: words with no control character or half an emoji; invisible characters never count as words.
const said = (what: string, max: number) => z.string().refine((x) => !UNSTORABLE.test(x), `${what} has a character that cannot be stored`).transform((x) => x.replace(INVISIBLE, "").trim()).pipe(z.string().min(1, `${what} is empty`).max(max));
const realDate = (d: string) => { const t = Date.parse(`${d}T00:00:00Z`); return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d && d >= "2000-01-01" && d <= "2099-12-31"; };
const SourceRef = z.union([z.literal("Sample"), z.strictObject({ url: z.string().max(500).regex(/^https:\/\/[^\s/]+\.[^\s]+$/, "url is the official page's https address"), section: said("section", 300), quote: said("quote", 2000), date: z.string().refine(realDate, "date is the day it was read, YYYY-MM-DD") })]).optional();
const INT = z.number().int().min(0).max(100_000);   // breaker M1: never past the INTEGER column, refused here, not at approval
const SCORE = z.number({ message: "a score is a finite number" }).min(-1000).max(1000);
const Band = z.strictObject({ when: z.record(z.string(), z.unknown()), points: INT, source_ref: SourceRef });
const Factor = z.strictObject({ key: z.string().regex(KEY).max(120), role: z.enum(["PRINCIPAL", "SPOUSE"]), facts: z.array(z.string().regex(/^[a-z][a-z0-9_.]{0,119}$/)).min(1).max(4), maximum: INT, source_ref: SourceRef, bands: z.array(Band).min(1).max(200) }).refine((f) => f.bands.reduce((n, b) => n + JSON.stringify(b.when).length, 0) <= 20_000, "a factor's band conditions are at most 20 000 characters (review r2 M3: the overlap check stays quick)");
const Conversion = z.strictObject({ test: z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/), skill: z.enum(["READING", "WRITING", "LISTENING", "SPEAKING"]), score_min: SCORE, score_max: SCORE, clb: z.number().int().min(1).max(12), source_ref: SourceRef });
export const GridFile = z.strictObject({
  key: z.string().regex(KEY).max(120), label: said("label", 200), selection_model: z.enum(["FIXED_PASS_MARK", "DRAW_RANKING"]),
  pass_mark: INT.nullable(), maximum: INT.min(1), combinations: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/, "a combination key")).min(1).max(50).refine((x) => new Set(x).size === x.length, "a combination is named twice"),
  source_ref: SourceRef, factors: z.array(Factor).min(1).max(100), language_conversion: z.array(Conversion).max(500).default([]),
}).transform((g) => ({ ...g, // breaker m4: language rows in one order, so the file's hash is the snapshot's whatever order they came in
  language_conversion: [...g.language_conversion].sort((a, b) => a.test.localeCompare(b.test) || a.skill.localeCompare(b.skill) || a.score_min - b.score_min || a.score_max - b.score_max) }));
export type Grid = z.infer<typeof GridFile>;
const Body_ = z.strictObject({ grid: z.unknown(), reason: said("the reason (say why, 3 to 300 characters)", 300).pipe(z.string().min(3, "Say why (3 to 300 characters).")) });

// ------------------------------------------------------------------------------------------- the band condition language
/** One fact's allowed values in a band: a numeric range (open or closed ends) or a set of exact values. */
type Span = { kind: "range"; lo: number; loIn: boolean; hi: number; hiIn: boolean } | { kind: "set"; values: (string | number | boolean)[] };
const COMPARE = new Set(["gt", "gte", "lt", "lte"]);
/** A band's condition in the configurator's condition language (contracts/rules.ts PredicateNode): eq or in on a fact, a
 *  comparison (gt, gte, lt, lte) with a number, or an "and" of those; each fact one of the factor's facts. Returns the
 *  span per fact, or the reason it is refused. */
export function spansOf(when: Record<string, unknown>, facts: string[]): Map<string, Span> | string {
  const leaves = when.op === "and" ? (Array.isArray(when.args) ? when.args : []) : [when];
  if (!leaves.length) return "an \"and\" needs its conditions";
  const out = new Map<string, Span>();
  for (const n of leaves as Record<string, unknown>[]) {
    const field = n?.field, op = n?.op, v = n?.value;
    if (typeof field !== "string" || !facts.includes(field)) return `the condition reads ${JSON.stringify(field)}, which is not one of the factor's facts (${facts.join(", ")})`;
    const had = out.get(field);
    if (op === "eq" || op === "in") {
      const values = op === "eq" ? [v] : Array.isArray(v) ? v : [];
      if (!values.length || values.length > 50 || !values.every((x) => typeof x === "string" ? x.length <= 200 && !UNSTORABLE.test(x) : typeof x === "boolean" || (typeof x === "number" && Number.isFinite(x)))) return `"${op}" on ${field} needs 1 to 50 values (words, finite numbers or yes/no)`;
      if (had) return `${field} is named twice in one band`;
      out.set(field, { kind: "set", values: values as (string | number | boolean)[] });
    } else if (COMPARE.has(op as string)) {
      if (typeof v !== "number" || !Number.isFinite(v)) return `"${op}" on ${field} needs a number`;
      if (had && had.kind === "set") return `${field} is named twice in one band`;
      const r = had ?? { kind: "range" as const, lo: -Infinity, loIn: false, hi: Infinity, hiIn: false };
      if (op === "gt" || op === "gte") { if (r.lo !== -Infinity) return `${field} has two lower ends`; Object.assign(r, { lo: v, loIn: op === "gte" }); }
      else { if (r.hi !== Infinity) return `${field} has two upper ends`; Object.assign(r, { hi: v, hiIn: op === "lte" }); }
      if (r.lo > r.hi || (r.lo === r.hi && !(r.loIn && r.hiIn))) return `${field}'s range is empty`;
      out.set(field, r);
    } else return `"${String(op)}" is not a band condition (eq, in, gt, gte, lt, lte, or "and" of them)`;
  }
  return out;
}
const inRange = (x: number, r: Extract<Span, { kind: "range" }>) => (x > r.lo || (x === r.lo && r.loIn)) && (x < r.hi || (x === r.hi && r.hiIn));
function meets(a: Span, b: Span): boolean {
  if (a.kind === "set" && b.kind === "set") { const bs = new Set(b.values.map(String)); return a.values.some((x) => bs.has(String(x))); }
  if (a.kind === "set" || b.kind === "set") { const [s, r] = (a.kind === "set" ? [a, b] : [b, a]) as [Extract<Span, { kind: "set" }>, Extract<Span, { kind: "range" }>]; return s.values.some((x) => typeof x === "number" && inRange(x, r)); }
  const lo = Math.max(a.lo, b.lo), hi = Math.min(a.hi, b.hi);
  if (lo < hi) return true;
  if (lo > hi) return false;
  return inRange(lo, a) && inRange(lo, b);
}
/** Two bands overlap when every fact both name can take one value both allow (a fact only one names is free in the other). */
const overlap = (a: Map<string, Span>, b: Map<string, Span>) => [...a].every(([f, s]) => !b.has(f) || meets(s, b.get(f)!));

/** Every reason the file cannot be imported, in plain words (empty: it can be). */
export function gridProblems(g: Grid): string[] {
  const out: string[] = [];
  const cited = (where: string, ref: unknown) => { if (ref === undefined) out.push(`${where} has neither a source_ref (url, section, quote, date) nor the label Sample`); };
  cited(`The grid "${g.key}"`, g.source_ref);
  if ((g.selection_model === "FIXED_PASS_MARK") !== (g.pass_mark !== null)) out.push(g.selection_model === "FIXED_PASS_MARK" ? "A FIXED_PASS_MARK grid needs its pass mark" : "A DRAW_RANKING grid has no pass mark (it gives a total only, P-236)");
  if (g.pass_mark !== null && g.pass_mark > g.maximum) out.push("The pass mark is above the grid's maximum");
  const seen = new Set<string>();
  g.factors.forEach((f) => {
    const name = `Factor "${f.key}" (${f.role.toLowerCase()})`;
    if (seen.has(`${f.key}|${f.role}`)) out.push(`${name} is listed twice`); seen.add(`${f.key}|${f.role}`);
    cited(name, f.source_ref);
    if (f.maximum > g.maximum) out.push(`${name}'s maximum is above the grid's`);
    const spans: Map<string, Span>[] = [], kinds = new Map<string, Set<string>>();
    f.bands.forEach((b, i) => {
      cited(`${name}, band ${i + 1}`, b.source_ref);
      if (b.points > f.maximum) out.push(`${name}, band ${i + 1} gives more points than the factor's maximum`);
      const s = spansOf(b.when, f.facts);
      if (typeof s === "string") { out.push(`${name}, band ${i + 1}: ${s}`); return; }
      // Breaker M3: the condition language compares as text when types differ, so one fact's bands use one kind of value.
      for (const [fact, x] of s) { const k = kinds.get(fact) ?? new Set<string>(); for (const t of x.kind === "range" ? ["number"] : x.values.map((v) => typeof v)) k.add(t); kinds.set(fact, k); }
      const j = spans.findIndex((x) => x && overlap(x, s));
      if (j >= 0) out.push(`${name}: bands ${j + 1} and ${i + 1} overlap (one answer would get two point values)`);
      spans[i] = s;
    });
    for (const [fact, k] of kinds) if (k.size > 1) out.push(`${name}: the bands on ${fact} mix ${[...k].sort().join(" and ")} values (one answer could match two bands)`);
  });
  g.language_conversion.forEach((c, i) => {
    const name = `Language conversion row ${i + 1} (${c.test} ${c.skill.toLowerCase()})`;
    cited(name, c.source_ref);
    if (c.score_min > c.score_max) out.push(`${name}: its lowest score is above its highest`);
    const j = g.language_conversion.findIndex((d, k) => k < i && d.test === c.test && d.skill === c.skill && d.score_min <= c.score_max && c.score_min <= d.score_max);
    if (j >= 0) out.push(`${name} overlaps row ${j + 1} (one score would give two CLB levels)`);
  });
  return out;
}
/** The file's content hash (canonical JSON), the same however its keys are ordered. */
export const gridSha = (g: Grid) => sha256(canonical(g as never));

// ------------------------------------------------------------------------------------------------------- reads and writes
const ref = (r: unknown) => (r === "Sample" || r === undefined ? { sourceRef: undefined, sample: true } : { sourceRef: r as Prisma.InputJsonValue, sample: false });
export const readGrid = (db: Pick<Db, "scoreRuleset"> | Tx, key: string) => db.scoreRuleset.findUnique({ where: { key }, include: GRID_INCLUDE });
const lockKey = (key: string) => `${GRID_KIND}:${key}`;
const plural = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
const words = (g: Grid) => `${g.label}: ${plural(g.factors.length, "factor")}, ${plural(g.factors.reduce((n, f) => n + f.bands.length, 0), "band")}, ${plural(g.language_conversion.length, "language row")}; ${g.selection_model === "FIXED_PASS_MARK" ? "a pass mark" : "a ranking total"}; for ${g.combinations.join(", ")}`;
/** Every row of the file, and how many are Sample (the audit line and To review say both, review m7). */
const sampleRows = (g: Grid) => { const rows = [g, ...g.factors, ...g.factors.flatMap((f) => f.bands), ...g.language_conversion]; return { rows: rows.length, sample: rows.filter((r) => r.source_ref === "Sample").length }; };
/** What the second person reads on To review (review M6): every factor, band and point value with its source. */
export function gridView(c: Pick<LibraryChange, "matches" | "reason">) {
  const m = (c.matches ?? {}) as { grid?: Grid; sha256?: string; before_sha256?: string | null };
  return { words: m.grid ? gridWords(m.grid) : "", sha256: m.sha256 ?? "", replaces: m.before_sha256 ?? null, reason: c.reason ?? "" };
}
export const gridChangeWords = (v: ReturnType<typeof gridView>) => `Import the score grid ${v.words} (file ${v.sha256.slice(0, 12)}${v.replaces ? `, replaces ${v.replaces.slice(0, 12)}` : ", new"}; goes out with each named combination's next release). Reason: ${v.reason}`;

/** Writes one grid in place of the stored one with its key (inside the caller's transaction, on the bypass use). */
async function writeGrid(tx: Tx, g: Grid, sha: string, by: string) {
  await tx.scoreRuleset.deleteMany({ where: { key: g.key } });
  await tx.scoreRuleset.create({ data: { key: g.key, label: g.label, selectionModel: g.selection_model, passMark: g.pass_mark, maximum: g.maximum, combinationKeys: g.combinations, ...ref(g.source_ref), importSha256: sha, importedBy: by,
    factors: { create: g.factors.map((f, i) => ({ factorKey: f.key, role: f.role, factKeys: f.facts, maximum: f.maximum, position: i, ...ref(f.source_ref), bands: { create: f.bands.map((b, j) => ({ condition: b.when as Prisma.InputJsonValue, points: b.points, position: j, ...ref(b.source_ref) })) } })) },
    conversions: { create: g.language_conversion.map((c) => ({ test: c.test, skill: c.skill, scoreMin: c.score_min, scoreMax: c.score_max, clb: c.clb, ...ref(c.source_ref) })) } } });
}

@Injectable()
export class ScoreGrids implements OnModuleInit {
  constructor(@Inject(Db) private readonly db: Db, @Inject(Workspace) private readonly ws: Workspace, @Inject(Audit) private readonly audit: Audit) {}

  /** At a second person's approval (lifecycle.ts asks the hook by action, no import cycle). */
  onModuleInit() { APPROVAL_HOOKS.set(GRID_ACTION, { check: (c) => this.recheck(this.db, c).then(() => undefined), apply: (actor, c) => this.apply(actor, c) }); }

  async list() {
    const rows = await this.db.scoreRuleset.findMany({ orderBy: { key: "asc" }, include: GRID_INCLUDE });
    return { grids: rows.map((r) => ({ ...snapGrid(r), imported_at: r.importedAt.toISOString() })) };
  }

  async propose(actor: Actor, body: unknown) {
    need(actor, "author"); // the author proposes; a second person approves (P-253)
    const b = Body_.safeParse(body);
    if (!b.success) throw problem(400, "Check the import", b.error.issues[0]?.message ?? "Send { grid, reason }.");
    const p = GridFile.safeParse(b.data.grid);
    if (!p.success) { const i = p.error.issues[0]; throw problem(400, "Check the grid file", `${i?.path.join(".") || "the file"}: ${i?.message ?? "not a grid file"} (samples/score-grids/README.md). Nothing was proposed.`, { code: "GRID_SHAPE" }); }
    const g = p.data, issues = gridProblems(g);
    if (issues.length) throw problem(400, "The grid cannot be imported", `${issues[0]}${issues.length > 1 ? ` (and ${issues.length - 1} more)` : ""}. Nothing was proposed.`, { code: issues.some((x) => /neither a source_ref/.test(x)) ? "GRID_UNCITED" : /overlap/.test(issues[0]) ? "GRID_OVERLAP" : "GRID_INVALID", problems: issues.slice(0, 20) });
    const workspaceId = await this.ws.id(), sha = gridSha(g);
    const c = await this.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext($1))`, lockKey(g.key));
      // Review M2, breaker M2: every combination it names exists and is not retired, so its release can carry it.
      const found = await tx.combination.findMany({ where: { workspaceId, combinationKey: { in: g.combinations }, retiredAt: null }, select: { combinationKey: true } });
      const missing = g.combinations.filter((k) => !found.some((f) => f.combinationKey === k));
      if (missing.length) throw problem(400, "Name existing combinations", `${missing.join(", ")} ${missing.length === 1 ? "is not a combination" : "are not combinations"} in the library (or ${missing.length === 1 ? "is" : "are"} retired). Nothing was proposed.`, { code: "GRID_COMBINATION" });
      const open = await tx.libraryChange.findFirst({ where: { kind: GRID_KIND, key: g.key, status: "WAITING" } });
      if (open) throw problem(409, "Already waiting", `An import of "${g.key}" already waits on To review: its proposer withdraws it, or a second person returns it, before another.`);
      await tx.libraryChange.updateMany({ where: { kind: GRID_KIND, key: g.key, status: { in: REPLACED } }, data: { status: "WITHDRAWN", decisionNote: `Replaced by a later import of the same grid, proposed by ${actor.name}.` } });
      const now = await readGrid(tx, g.key);
      if (now?.importSha256 === sha) throw problem(409, "Nothing changes", `"${g.label}" is already in the library exactly as in this file.`);
      return tx.libraryChange.create({ data: { workspaceId, kind: GRID_KIND, key: g.key, label: words(g).slice(0, 300), action: GRID_ACTION, reason: b.data.reason, status: "WAITING", proposedBy: actor.id,
        matches: { grid: g, sha256: sha, before_sha256: now?.importSha256 ?? null } as unknown as Prisma.InputJsonValue } });
    });
    await this.audit.log(workspaceId, actor.id, "proposed", "score grid", g.key, `${actor.name} proposed the score grid ${words(g)} (sha256 ${sha.slice(0, 12)}; ${((r) => r.sample ? `${r.sample} of ${r.rows} rows Sample` : "every row cited")(sampleRows(g))}); waits for a second person. Why: ${b.data.reason}`.slice(0, 600));
    return { id: c.id, status: c.status, label: c.label, sha256: sha };
  }

  /** Checked again at approval: the file still passes, and the stored grid is the one the proposal saw. */
  private async recheck(db: Pick<Db, "scoreRuleset"> | Tx, c: LibraryChange) {
    const m = c.matches as { grid?: unknown; sha256?: string; before_sha256?: string | null };
    const p = GridFile.safeParse(m.grid);
    if (!p.success || gridProblems(p.data).length || gridSha(p.data) !== m.sha256) throw problem(409, "Check the grid file", "This import no longer passes the grid checks, so nothing was applied. Return it; the author imports the file again.");
    const now = await readGrid(db, p.data.key);
    if ((now?.importSha256 ?? null) !== (m.before_sha256 ?? null)) throw problem(409, "Changed since", "This grid changed in the library after the import was proposed, so nothing was applied. Return it; the author imports the file again.");
    return p.data;
  }

  private async apply(actor: Actor, seen: LibraryChange) {
    const g = await asBypass(SCORE_GRIDS_APPLY, () => this.db.$transaction(async (tx) => {
      await touchPlatform(tx);   // the use's one firm-less platform.bypass line (no firm's rows)
      await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext($1))`, lockKey(seen.key));
      const c = await tx.libraryChange.findUnique({ where: { id: seen.id } });
      if (c?.status !== "APPROVED") return null;
      const g = await this.recheck(tx, c);
      await writeGrid(tx, g, (c.matches as { sha256: string }).sha256, c.proposedBy); await tx.libraryChange.updateMany({ where: { kind: GRID_KIND, key: c.key, status: "APPROVED", id: { not: c.id } }, data: { status: "WITHDRAWN", decisionNote: "Replaced by a later approved import of the same grid before any release carried it." } });
      return g;
    }, { timeout: 30_000, maxWait: 10_000 }));
    if (!g) throw problem(409, "Changed meanwhile", "This change was withdrawn at the same moment, so nothing was applied. Refresh to see it.");
    await this.audit.log(seen.workspaceId, actor.id, "approved", "score grid", g.key, `${actor.name} approved the score grid ${words(g)}. Each of its combinations carries it in its next release.`.slice(0, 600));
  }
}

/** At a release (publishLibraryChanges): an approved import is released once every combination it names that exists has
 *  a release carrying exactly this grid. */
export async function releaseScoreGrids(tx: Tx, workspaceId: string, pack: number) {
  const out: { kind: string; key: string; label: string; action: string }[] = [];
  for (const c of await tx.libraryChange.findMany({ where: { workspaceId, kind: GRID_KIND, status: "APPROVED" } })) {
    const m = c.matches as { grid?: Grid; sha256?: string };
    const combos = await tx.combination.findMany({ where: { workspaceId, combinationKey: { in: m.grid?.combinations ?? [] } }, select: { id: true } });
    let carried = combos.length > 0;
    for (const k of combos) {
      const last = await tx.configRelease.findFirst({ where: { combinationId: k.id }, orderBy: { version: "desc" }, select: { snapshot: true } });
      const grids = ((last?.snapshot as { score_grids?: SnapGrid[] } | null)?.score_grids ?? []);
      if (!grids.some((x) => x.key === c.key && x.sha256 === m.sha256)) carried = false;
    }
    if (!carried) continue;
    await tx.libraryChange.update({ where: { id: c.id }, data: { status: "RELEASED", releasedIn: pack } });
    out.push({ kind: c.kind, key: c.key, label: c.label ?? c.key, action: c.action });
  }
  return out;
}

@Controller("api/library/score-grids")
export class ScoreGridsController {
  constructor(@Inject(ScoreGrids) private readonly s: ScoreGrids) {}
  @Get() list(@Headers("x-actor") a: H) { readerOf(a); return this.s.list(); }
  @Post() propose(@Headers("x-actor") a: H, @Body() b: unknown) { return this.s.propose(actorOf(a), b); }
}
