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
