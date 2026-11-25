// AS-1m (P-588, contract v0.1 §2.6): the gate types and gateFacts, moved unchanged from engine/eligibility-gates.ts
// (which re-exports them), so engine/eligibility/ never reaches engine/runtime/ (eligibility-gates.ts imports
// validate.ts, which reaches engine/runtime/). Pure, no import.

/** `whenNotMet` (P-230 (1), BACKLOG R4): what a gate not met means, as data. Absent: Not eligible (the default).
 *  "needs_review": the representative reviews it, so the result is Possibly eligible, never Not eligible (the background
 *  question: rehabilitation, record suspension and a temporary resident permit exist). Stored only when set, so the
 *  releases made before it keep their fingerprints. */
export type WhenNotMet = "not_eligible" | "needs_review";
/** AS-2a (R1.107, AGENTS rule 4, P-170): where a gate's rule comes from: an official page read on a day (its URL, the
 *  section, the words quoted and the date read), or the label Sample. Stored only when set, so releases made before it
 *  keep their fingerprints. */
export type GateSource = { url: string; section: string; quote: string; date: string } | { sample: true };
export type Gate = { key: string; label: string; condition: Record<string, unknown>; whenNotMet?: "needs_review"; source?: GateSource };
/** What the combination row stores (combination.eligibility). `disclaimer` null: the Sample default goes into the release. */
/** AS-2a (P-650 (2)): `assessment_only` marks a combination used only to assess a person (a provincial stream in
 *  Release 1): it is released with no form, every gate is cited or Sample, and no case opens on it. Absent: as before. */
export type StoredEligibility = { gates: Gate[]; judgement: string[]; disclaimer: string | null; version: number; by: string; at: string; assessment_only?: true };
/** What a release carries (snapshot.eligibility), frozen with it. */
export type SnapshotEligibility = { gates: Gate[]; judgement: string[]; disclaimer: string; assessment_only?: true };
/** AS-2a: an assessment-only release (with at least one gate: zero gates is no result, BR-10). */
export const isAssessmentOnly = (e: Partial<Pick<SnapshotEligibility, "gates" | "assessment_only">> | null | undefined): boolean => !!e?.assessment_only && !!e.gates?.length;
/** AS-2a, break B1 on 6f71259ea: what makes a release assessment only is the flag, at least one gate, and no form and no
 *  document line. The flag on a combination that still files is refused at validation (engine/validate.ts), so it never
 *  switches a filing release's checks off; every check that treats a release as assessment only reads this. */
export const assessmentOnlyRelease = (s: { forms?: unknown[]; document_requirements?: unknown[]; eligibility?: unknown }): boolean =>
  isAssessmentOnly(s.eligibility as never) && !(s.forms ?? []).length && !(s.document_requirements ?? []).length;
/** AS-2a: the words a person reads on such a release (P-650 (2)). */
export const ASSESSMENT_ONLY_WORDS = "Assessment only: no forms";
/** The facts a set of gates reads, in gate order, once each. */
export function gateFacts(e: Pick<SnapshotEligibility, "gates"> | undefined): string[] {
  return [...new Set((e?.gates ?? []).flatMap((g) => [...JSON.stringify(g.condition).matchAll(/"field":"([^"]+)"/g)].map((m) => m[1])))];
}
