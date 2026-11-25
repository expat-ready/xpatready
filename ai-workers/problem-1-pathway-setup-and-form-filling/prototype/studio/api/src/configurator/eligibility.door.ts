// AS-1m (R1.106; P-588; case-side contract v0.1 §2.6, §3.2): the configurator's adapter for EligibilityPort. It loads a
// release snapshot of the caller's workspace and runs the pure rules of engine/eligibility/ on it; nothing else. Rules only:
// no model call, no spend (US$0), no write. Imports its module, engine/eligibility/ and ports/ only (§2.6).
// Roles: a gate is about the principal unless its rule's root is about the spouse (subjectKind SPOUSE); a spouse's gate
// with no spouse on the application does not apply. Gates saved today are all per person (checkGates), so the spouse's
// list stays empty until a release carries a spouse's rule (AS-1g, AS-1s). `scores` is empty until AS-1s.
import type { Snapshot } from "../../../engine/snapshot.ts";
import { gateFacts, isAssessmentOnly, type Gate, type SnapshotEligibility } from "../../../engine/eligibility/gates.ts";
import { gateResult, outcomeOf, type GateResult } from "../../../engine/eligibility/assess.ts";
import { kkey, type Known } from "../../../engine/resolver.ts";
import {
  AssessInput, EligibilityRefused, EligibilityResult, type AssessableRelease, type EligibilityPort, type EligibilityReason,
  type EligibilityRole, type RequiredFact, type RequiredFacts, type RuleLine,
} from "../../../ports/eligibility.port.ts";

/** One release row as the adapter reads it (config_release). */
export type ReleaseRow = { id: string; combinationId: string; version: number; status: string; sha256: string; snapshot: unknown };
/** Where the releases come from, already bound to one workspace (the demo boundary, never a firm id: contract v0.1 §0). */
export type ReleaseReader = { released(): Promise<ReleaseRow[]>; byId(id: string): Promise<ReleaseRow | null> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT = { id: true, combinationId: true, version: true, status: true, sha256: true, snapshot: true } as const;
type ReleaseTable = { findMany(a: unknown): Promise<ReleaseRow[]>; findFirst(a: unknown): Promise<ReleaseRow | null> };

/** The workspace's releases from the database. A malformed id is no release (never a database error). */
export function prismaReleases(db: { configRelease: unknown }, workspaceId: string): ReleaseReader {
  const t = db.configRelease as ReleaseTable;
  return {
    released: () => t.findMany({ where: { workspaceId, status: "RELEASED" }, select: SELECT, orderBy: [{ combinationId: "asc" }, { version: "desc" }] }),
    byId: async (id) => (UUID.test(id) ? t.findFirst({ where: { id, workspaceId }, select: SELECT }) : null),
  };
}

const PERSON: Record<EligibilityRole, string> = { principal: "principal", spouse: "spouse" };
const roleOf = (g: Gate): EligibilityRole => ((g.condition as { subjectKind?: unknown })?.subjectKind === "SPOUSE" ? "spouse" : "principal");
const rulesOf = (s: Snapshot) => s.eligibility as SnapshotEligibility | undefined;
const fieldOf = (s: Snapshot, key: string) => (s.canonical_fields ?? []).find((f: { id?: string }) => f.id === key) as { meaning?: string; value_type?: string; answer_list?: { values?: { key: string }[] } } | undefined;

export class ConfiguratorEligibility implements EligibilityPort {
  constructor(private readonly releases: ReleaseReader) {}

  private async load(id: string) {
    const row = await this.releases.byId(id);
    if (!row) throw new EligibilityRefused("RELEASE_NOT_FOUND", id);
    const s = row.snapshot as Snapshot;
    if (!rulesOf(s)?.gates?.length) throw new EligibilityRefused("NO_RULES", id);
    return { row, s, gates: rulesOf(s)!.gates };
  }

  async listAssessable(): Promise<AssessableRelease[]> {
    const newest = new Map<string, ReleaseRow>();
    for (const r of await this.releases.released()) {
      if (!rulesOf(r.snapshot as Snapshot)?.gates?.length) continue;
      const was = newest.get(r.combinationId);
      if (!was || r.version > was.version) newest.set(r.combinationId, r);
    }
    return [...newest.values()].map((r) => ({ combination_id: r.combinationId, name: (r.snapshot as Snapshot).combination.label, release_id: r.id, version: r.version, content_hash: r.sha256, assessment_only: isAssessmentOnly(rulesOf(r.snapshot as Snapshot)) }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.release_id.localeCompare(b.release_id));
  }

  async requiredFacts(id: string): Promise<RequiredFacts> {
    const { row, s, gates } = await this.load(id);
    const seen = new Set<string>(), facts: RequiredFact[] = [];
    for (const g of gates) for (const key of gateFacts({ gates: [g] })) {
      const role = roleOf(g);
      if (seen.has(`${role}|${key}`)) continue;
      seen.add(`${role}|${key}`);
      const f = fieldOf(s, key), list = f?.answer_list?.values?.map((v) => v.key);
      facts.push({ role, key, wording: f?.meaning || key, value_type: f?.value_type ?? null, allowed_values: list?.length ? list : null });
    }
    return { release_id: row.id, facts };
  }

  async assess(input: AssessInput): Promise<EligibilityResult> {
    const q = AssessInput.parse(input);
    const { row, s, gates } = await this.load(q.release_id);
    const known: Known = new Map();
    for (const p of q.persons) for (const [fact, value] of Object.entries(p.known)) known.set(kkey(PERSON[p.role], fact), { value, status: "answered", source: "eligibility-port" });
    const has = (role: EligibilityRole) => q.persons.some((p) => p.role === role);
    const read: { role: EligibilityRole; r: GateResult }[] = gates.filter((g) => has(roleOf(g))).map((g) => ({ role: roleOf(g), r: gateResult(s, known, g, PERSON[roleOf(g)]) }));
    // Review m2: a release whose every gate is the spouse's, with no spouse given, reads no gate: no result (BR-10).
    if (!read.length) throw new EligibilityRefused("NO_RULES", row.id);
    const { outcome } = outcomeOf(read.map((x) => x.r));
    const reasons: EligibilityReason[] = [], missing: { role: EligibilityRole; key: string }[] = [], seen = new Set<string>();
    for (const { role, r } of read) {
      if (r.state === "not_met") reasons.push({ kind: r.whenNotMet === "needs_review" ? "GATE_NEEDS_REVIEW" : "GATE_NOT_MET", role, ref: r.key, words: r.label });
      for (const key of r.missing) if (!seen.has(`${role}|${key}`)) { seen.add(`${role}|${key}`); missing.push({ role, key }); }
    }
    for (const m of missing) reasons.push({ kind: "FACT_MISSING", role: m.role, ref: m.key, words: fieldOf(s, m.key)?.meaning || m.key });
    // AS-2a: every rule read, with its state and its source (null for a rule saved without one).
    const source = new Map(gates.map((g) => [g.key, g.source ?? null]));
    const rules: RuleLine[] = read.map(({ role, r }) => ({ role, ref: r.key, words: r.label, state: r.state, source: source.get(r.key) ?? null }));
    return EligibilityResult.parse({ outcome, reasons, missing_facts: missing, rules, scores: [], rules_version: { release_id: row.id, content_hash: row.sha256 }, disclaimer: rulesOf(s)!.disclaimer });
  }
}
