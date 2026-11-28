// AS-1m (contract v0.1 §3.2 "Fake: two Sample combinations with fixed answers, one with a Sample grid"): EligibilityPort's
// fake, for the front office's and the case side's tests before they reach the configurator's adapter. Everything here
// is Sample: invented keys, labels and rules, no immigration value (AGENTS rule 4). The Sample grid only adds the facts
// it reads to requiredFacts (a spouse's among them); `scores` stays empty until AS-1s fills it on both sides. It keeps
// the same behaviour as the adapter (ports/contracts/eligibility-port.contract.ts runs against both). Imports only zod
// and the port (contract v0.1 §1 rule 3).
import {
  AssessInput, EligibilityRefused, EligibilityResult, type AssessableRelease, type EligibilityPort, type EligibilityReason,
  type EligibilityRole, type MissingFact, type RequiredFact, type RequiredFacts, type RuleLine,
} from "../eligibility.port.ts";

type SampleGate = { key: string; label: string; role: EligibilityRole; fact: string; equals: unknown; needsReview?: true };
type SampleRelease = Omit<AssessableRelease, "assessment_only"> & { gates: SampleGate[]; grid: { role: EligibilityRole; fact: string }[]; words: Record<string, { wording: string; value_type: string; allowed_values: string[] | null }> };

const DISCLAIMER = "Sample: indicative only. This check compares the answers given with Sample rules; it is not a guarantee of approval.";
const WORDS = {
  "sample.travel_document": { wording: "Sample: do you hold a valid travel document?", value_type: "yes_no", allowed_values: null },
  "sample.ties_reviewed": { wording: "Sample: are your ties to home documented?", value_type: "yes_no", allowed_values: null },
  "sample.work_years": { wording: "Sample: years of skilled work", value_type: "number", allowed_values: null },
  "sample.language_level": { wording: "Sample: language test level", value_type: "single_choice", allowed_values: ["sample_low", "sample_mid", "sample_high"] },
  "sample.spouse_language_level": { wording: "Sample: the spouse's language test level", value_type: "single_choice", allowed_values: ["sample_low", "sample_mid", "sample_high"] },
};

/** The two Sample combinations. The fixed answers that give each outcome are SAMPLE_PROFILES below. */
export const SAMPLE_RELEASES: readonly SampleRelease[] = [
  {
    combination_id: "sample-combination-visit", name: "Sample visit", release_id: "sample-release-visit-1", version: 1, content_hash: "sample-hash-visit-1",
    gates: [
      { key: "sample.document", label: "Sample: holds a travel document", role: "principal", fact: "sample.travel_document", equals: true },
      { key: "sample.ties", label: "Sample: ties to home reviewed", role: "principal", fact: "sample.ties_reviewed", equals: true, needsReview: true },
    ],
    grid: [], words: WORDS,
  },
  {
    combination_id: "sample-combination-points", name: "Sample points", release_id: "sample-release-points-2", version: 2, content_hash: "sample-hash-points-2",
    gates: [{ key: "sample.work", label: "Sample: one year of skilled work", role: "principal", fact: "sample.work_years", equals: 1 }],
    grid: [{ role: "principal", fact: "sample.language_level" }, { role: "spouse", fact: "sample.spouse_language_level" }], words: WORDS,
  },
];

/** Fixed answers for the contract's three outcomes, on the Sample visit release. */
export const SAMPLE_PROFILES = {
  likely: { release_id: "sample-release-visit-1", persons: [{ role: "principal", known: { "sample.travel_document": true, "sample.ties_reviewed": true } }] },
  possibly: { release_id: "sample-release-visit-1", persons: [{ role: "principal", known: { "sample.ties_reviewed": true } }] },
  not: { release_id: "sample-release-visit-1", persons: [{ role: "principal", known: { "sample.travel_document": false, "sample.ties_reviewed": true } }] },
} satisfies Record<string, AssessInput>;

const present = (v: unknown) => v !== undefined && v !== null && v !== "";

/** The fake. `releases` replaces the Sample releases (an empty list is "another workspace": nothing is found). */
export function fakeEligibility(releases: readonly SampleRelease[] = SAMPLE_RELEASES): EligibilityPort {
  const find = (id: string) => { const r = releases.find((x) => x.release_id === id); if (!r) throw new EligibilityRefused("RELEASE_NOT_FOUND", id); return r; };
  return {
    async listAssessable() {
      return releases.map(({ combination_id, name, release_id, version, content_hash }) => ({ combination_id, name, release_id, version, content_hash, assessment_only: false }));
    },
    async requiredFacts(id: string): Promise<RequiredFacts> {
      const r = find(id), seen = new Set<string>(), facts: RequiredFact[] = [];
      for (const x of [...r.gates, ...r.grid]) {
        if (seen.has(`${x.role}|${x.fact}`)) continue;
        seen.add(`${x.role}|${x.fact}`);
        facts.push({ role: x.role, key: x.fact, ...r.words[x.fact as keyof typeof r.words] });
      }
      return { release_id: r.release_id, facts };
    },
    async assess(input: AssessInput) {
      const q = AssessInput.parse(input), r = find(q.release_id);
      const of = (role: EligibilityRole) => q.persons.find((p) => p.role === role)?.known;
      const reasons: EligibilityReason[] = [], missing: MissingFact[] = [], rules: RuleLine[] = [];
      let failed = false, review = false;
      for (const g of r.gates) {
        const known = of(g.role);
        if (!known) continue; // a spouse's rule with no spouse on the application does not apply
        const v = known[g.fact];
        // AS-2a: every Sample rule is labelled Sample on its line.
        const line = (state: RuleLine["state"]) => rules.push({ role: g.role, ref: g.key, words: g.label, state, source: { sample: true } });
        if (!present(v)) { missing.push({ role: g.role, key: g.fact }); line("not_answered"); continue; }
        if (v === g.equals) { line("met"); continue; }
        line("not_met");
        if (g.needsReview) { review = true; reasons.push({ kind: "GATE_NEEDS_REVIEW", role: g.role, ref: g.key, words: g.label }); }
        else { failed = true; reasons.push({ kind: "GATE_NOT_MET", role: g.role, ref: g.key, words: g.label }); }
      }
      for (const m of missing) reasons.push({ kind: "FACT_MISSING", role: m.role, ref: m.key, words: r.words[m.key as keyof typeof r.words].wording });
      const outcome = failed ? "NOT_ELIGIBLE" : missing.length || review ? "POSSIBLY_ELIGIBLE" : "LIKELY_ELIGIBLE";
      return EligibilityResult.parse({ outcome, reasons, missing_facts: missing, rules, scores: [], rules_version: { release_id: r.release_id, content_hash: r.content_hash }, disclaimer: DISCLAIMER });
    },
  };
}
