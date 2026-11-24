// AS-1g (R1.106; P-577): a stored score grid (prisma/schema/library-score-grids.prisma) back in its import file's shape
// (samples/score-grids/README.md), for the snapshot (score_grids) and the library's list. Sample rows read "Sample".
import type { Prisma } from "@prisma/client";

export type SourceRef = "Sample" | { url: string; section: string; quote: string; date: string };
export type GridFileShape = {
  key: string; label: string; selection_model: "FIXED_PASS_MARK" | "DRAW_RANKING"; pass_mark: number | null; maximum: number; combinations: string[]; source_ref?: SourceRef;
  factors: { key: string; role: "PRINCIPAL" | "SPOUSE"; facts: string[]; maximum: number; source_ref?: SourceRef; bands: { when: Record<string, unknown>; points: number; source_ref?: SourceRef }[] }[];
  language_conversion: { test: string; skill: "READING" | "WRITING" | "LISTENING" | "SPEAKING"; score_min: number; score_max: number; clb: number; source_ref?: SourceRef }[];
};
/** A grid as a release carries it: the file's content and its import hash. */
export type SnapGrid = GridFileShape & { sha256: string };

export const GRID_INCLUDE = { factors: { orderBy: { position: "asc" }, include: { bands: { orderBy: { position: "asc" } } } }, conversions: { orderBy: [{ test: "asc" }, { skill: "asc" }, { scoreMin: "asc" }] } } as const satisfies Prisma.ScoreRulesetInclude;
export type StoredGrid = Prisma.ScoreRulesetGetPayload<{ include: typeof GRID_INCLUDE }>;
const refOut = (r: { sourceRef: unknown; sample: boolean }) => (r.sample ? "Sample" : r.sourceRef) as SourceRef;

export function gridOf(r: StoredGrid): GridFileShape {
  return { key: r.key, label: r.label, selection_model: r.selectionModel, pass_mark: r.passMark, maximum: r.maximum, combinations: r.combinationKeys, source_ref: refOut(r),
    factors: r.factors.map((f) => ({ key: f.factorKey, role: f.role, facts: f.factKeys, maximum: f.maximum, source_ref: refOut(f), bands: f.bands.map((b) => ({ when: b.condition as Record<string, unknown>, points: b.points, source_ref: refOut(b) })) })),
    language_conversion: r.conversions.map((c) => ({ test: c.test, skill: c.skill as GridFileShape["language_conversion"][number]["skill"], score_min: c.scoreMin, score_max: c.scoreMax, clb: c.clb, source_ref: refOut(c) })) };
}
export const snapGrid = (r: StoredGrid): SnapGrid => ({ ...gridOf(r), sha256: r.importSha256 });

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const OPS: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };
/** A band's condition in words ("18 ≤ person.age < 36", "person.clb is 7 or 8"). */
export function conditionWords(w: Record<string, unknown>): string {
  const leaves = (w.op === "and" ? (w.args as Record<string, unknown>[]) : [w]) ?? [];
  return leaves.map((x) => x.op === "eq" ? `${x.field} is ${JSON.stringify(x.value)}` : x.op === "in" ? `${x.field} is ${(x.value as unknown[]).map((v) => JSON.stringify(v)).join(" or ")}` : `${x.field} ${OPS[String(x.op)] ?? x.op} ${x.value}`).join(" and ");
}
const src = (r?: SourceRef) => (r === "Sample" || !r ? "Sample" : `${r.url} §${r.section}, ${r.date}: "${r.quote.slice(0, 160)}"`);
/** What the second person and the immigration expert read: every factor, band and point value with its source. */
export function gridWords(g: GridFileShape): string {
  const rows = [g, ...g.factors, ...g.factors.flatMap((f) => f.bands), ...g.language_conversion];
  const sample = rows.filter((r) => r.source_ref === "Sample").length;
  const head = `${g.label} (${g.selection_model === "FIXED_PASS_MARK" ? `pass mark ${g.pass_mark}` : "ranking total, no pass mark"}, maximum ${g.maximum}; for ${g.combinations.join(", ")}; ${n(rows.length - sample, "row")} cited, ${sample} Sample).`;
  const factors = g.factors.map((f) => `${f.key} (${f.role.toLowerCase()}, maximum ${f.maximum}; ${src(f.source_ref)}): ${f.bands.map((b) => `${conditionWords(b.when)} → ${n(b.points, "point")} [${src(b.source_ref)}]`).join("; ")}`);
  const lang = g.language_conversion.length ? [`Language: ${g.language_conversion.map((c) => `${c.test} ${c.skill.toLowerCase()} ${c.score_min}-${c.score_max} → CLB ${c.clb} [${src(c.source_ref)}]`).join("; ")}`] : [];
  return [head, ...factors, ...lang].join(" · ").slice(0, 6000);
}
