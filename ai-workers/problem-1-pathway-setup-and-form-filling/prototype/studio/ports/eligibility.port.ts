// AS-1m (R1.106; P-588, P-577; case-side contract v0.1 §2.6, §3.2): EligibilityPort, the configurator's door to the
// eligibility rules, for AS-1 on a lead (front office) and for case delivery's case assessment. The rules themselves are
// in engine/eligibility/ (pure); the adapter is api/src/configurator/eligibility.door.ts; the fake is
// ports/fakes/eligibility.fake.ts; the shared behaviour is ports/contracts/eligibility-port.contract.ts.
// Pure and repeatable: the same release and facts give the same result. No immigration value lives here (P-577, AGENTS
// rule 4): outcomes, reasons and scores are shapes, and every number comes from a release. An adapter is bound to one
// workspace (today's demo boundary, never a firm id: contract v0.1 §0) by its caller, never by an argument a client can
// send; another workspace's release is not found.
// This folder imports only zod and its own files (contract v0.1 §1 rule 3; tests/check_as1m_eligibility_move.ts).
import { z } from "zod";

/** Whose facts: the principal applicant's, or the spouse's or partner's (a ranking score reads both, §3.2). */
export const EligibilityRole = z.enum(["principal", "spouse"]);
export type EligibilityRole = z.infer<typeof EligibilityRole>;

/** The three outcomes. ELIGIBLE_BELOW_CUTOFF stays out of the port while P-236 holds (no draw cut-off is predicted). */
export const EligibilityOutcome = z.enum(["LIKELY_ELIGIBLE", "POSSIBLY_ELIGIBLE", "NOT_ELIGIBLE"]);
export type EligibilityOutcome = z.infer<typeof EligibilityOutcome>;

const Id = z.string().min(1).max(200);
const Key = z.string().min(1).max(200);

/** One release a person can be assessed against: the newest released version of a combination that has rules. */
/** AS-2a (P-650 (2)): `assessment_only` is true for a release used only to assess a person (no form; no case opens). */
export const AssessableRelease = z.strictObject({ combination_id: Id, name: z.string().min(1).max(500), release_id: Id, version: z.number().int().min(1), content_hash: z.string().min(1).max(200), assessment_only: z.boolean() });
export type AssessableRelease = z.infer<typeof AssessableRelease>;

/** One fact a release's gates (and, from AS-1s, its grids) read, for one role: its canonical answer key, the question's
 *  words, its value type and, for a list question, the codes it allows (null when any value of its type is allowed). */
export const RequiredFact = z.strictObject({ role: EligibilityRole, key: Key, wording: z.string().min(1).max(2000), value_type: z.string().max(80).nullable(), allowed_values: z.array(z.string().max(200)).nullable() });
export type RequiredFact = z.infer<typeof RequiredFact>;
export const RequiredFacts = z.strictObject({ release_id: Id, facts: z.array(RequiredFact) });
export type RequiredFacts = z.infer<typeof RequiredFacts>;

/** One person's facts, by canonical answer key. A key with no answer is left out (null or "" count as no answer). */
export const EligibilityPerson = z.strictObject({ role: EligibilityRole, known: z.record(Key, z.unknown()) });
export type EligibilityPerson = z.infer<typeof EligibilityPerson>;
/** One principal, at most one spouse or partner. */
export const AssessInput = z.strictObject({ release_id: Id, persons: z.array(EligibilityPerson).min(1).max(2) })
  .refine((x) => x.persons.filter((p) => p.role === "principal").length === 1, { message: "Give exactly one principal applicant.", path: ["persons"] })
  .refine((x) => x.persons.filter((p) => p.role === "spouse").length <= 1, { message: "Give at most one spouse or partner.", path: ["persons"] });
export type AssessInput = z.infer<typeof AssessInput>;

/** Why the outcome is what it is: a gate not met (NOT_ELIGIBLE), a gate whose "when not met" is a review
 *  (POSSIBLY_ELIGIBLE, the representative reviews it), or a fact not answered (POSSIBLY_ELIGIBLE). `ref` is the gate key
 *  or the fact key; `words` is the gate's label or the question's words. */
export const EligibilityReason = z.strictObject({ kind: z.enum(["GATE_NOT_MET", "GATE_NEEDS_REVIEW", "FACT_MISSING"]), role: EligibilityRole, ref: Key, words: z.string().min(1).max(2000) });
export type EligibilityReason = z.infer<typeof EligibilityReason>;
export const MissingFact = z.strictObject({ role: EligibilityRole, key: Key });
export type MissingFact = z.infer<typeof MissingFact>;

/** AS-1's score and grid-breakdown types (§2.6). One line per factor of a grid: the points earned (null while its fact
 *  is missing: shown as "—", never as an earned 0, BR-7), the most it can give, and where the value comes from. Empty
 *  until AS-1s fills it from a release's grids. */
export const ScoreLine = z.strictObject({ factor: Key, points: z.number().nullable(), max: z.number().nullable(), source_ref: z.string().max(2000).nullable() });
export type ScoreLine = z.infer<typeof ScoreLine>;
export const GridScore = z.strictObject({ grid: Key, total: z.number(), lines: z.array(ScoreLine) });
export type GridScore = z.infer<typeof GridScore>;

/** AS-2a (R1.107, AGENTS rule 4, P-170): where a rule comes from: the official page (URL, section, the words quoted,
 *  the day it was read), or the label Sample. Null: the release gives none (a rule saved before AS-2a). */
export const RuleSource = z.union([
  z.strictObject({ url: z.string().url().max(500), section: z.string().min(1).max(200), quote: z.string().min(1).max(2000), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.strictObject({ sample: z.literal(true) }),
]);
export type RuleSource = z.infer<typeof RuleSource>;
/** AS-2a: one line per rule the assessment read, in the release's order, met or not, with its source: so "eligible"
 *  shows the rules it rests on, and "not eligible" the rule that failed and where it comes from (BR-6, AG-3-13). */
export const RuleLine = z.strictObject({ role: EligibilityRole, ref: Key, words: z.string().min(1).max(2000), state: z.enum(["met", "not_met", "not_answered"]), source: RuleSource.nullable() });
export type RuleLine = z.infer<typeof RuleLine>;

/** Which rules gave the result: the release and its fingerprint, stored with the result (FO-15b, CS-106c). */
export const RulesVersion = z.strictObject({ release_id: Id, content_hash: z.string().min(1).max(200) });
export type RulesVersion = z.infer<typeof RulesVersion>;

export const EligibilityResult = z.strictObject({
  outcome: EligibilityOutcome, reasons: z.array(EligibilityReason), missing_facts: z.array(MissingFact), rules: z.array(RuleLine),
  scores: z.array(GridScore), rules_version: RulesVersion, disclaimer: z.string().min(1).max(4000),
});
export type EligibilityResult = z.infer<typeof EligibilityResult>;

/** The typed refusals: an unknown release (or another workspace's), and a release with no eligibility rules, or none that applies to
 *  the persons given (BR-10: zero gates is no result). A malformed input is refused by AssessInput's own ZodError. */
export class EligibilityRefused extends Error {
  constructor(readonly code: "RELEASE_NOT_FOUND" | "NO_RULES", readonly releaseId: string) {
    super(code === "RELEASE_NOT_FOUND" ? `No such release: ${releaseId}.` : `This release has no eligibility rules yet: ${releaseId}.`);
    this.name = "EligibilityRefused";
  }
}
export const isNotFound = (e: unknown) => e instanceof EligibilityRefused && e.code === "RELEASE_NOT_FOUND";

export interface EligibilityPort {
  /** The releases a person can be assessed against, one per combination (its newest released version with rules). */
  listAssessable(): Promise<AssessableRelease[]>;
  /** The facts the release's rules read, per role: a spouse's facts appear only when a rule reads them. */
  requiredFacts(releaseId: string): Promise<RequiredFacts>;
  /** One assessment. Throws EligibilityRefused for an unknown release or one with no rules, ZodError for a bad input. */
  assess(input: AssessInput): Promise<EligibilityResult>;
}
