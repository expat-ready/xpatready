// AS-1m (P-588, contract v0.1 §2.6): the gate types and gateFacts, moved unchanged from engine/eligibility-gates.ts
// (which re-exports them), so engine/eligibility/ never reaches engine/runtime/ (eligibility-gates.ts imports
// validate.ts, which reaches engine/runtime/). Pure, no import.

/** `whenNotMet` (P-230 (1), BACKLOG R4): what a gate not met means, as data. Absent: Not eligible (the default).
 *  "needs_review": the representative reviews it, so the result is Possibly eligible, never Not eligible (the background
 *  question: rehabilitation, record suspension and a temporary resident permit exist). Stored only when set, so the
 *  releases made before it keep their fingerprints. */
export type WhenNotMet = "not_eligible" | "needs_review";
export type Gate = { key: string; label: string; condition: Record<string, unknown>; whenNotMet?: "needs_review" };
/** What the combination row stores (combination.eligibility). `disclaimer` null: the Sample default goes into the release. */
export type StoredEligibility = { gates: Gate[]; judgement: string[]; disclaimer: string | null; version: number; by: string; at: string };
/** What a release carries (snapshot.eligibility), frozen with it. */
export type SnapshotEligibility = { gates: Gate[]; judgement: string[]; disclaimer: string };
/** The facts a set of gates reads, in gate order, once each. */
export function gateFacts(e: Pick<SnapshotEligibility, "gates"> | undefined): string[] {
  return [...new Set((e?.gates ?? []).flatMap((g) => [...JSON.stringify(g.condition).matchAll(/"field":"([^"]+)"/g)].map((m) => m[1])))];
}
