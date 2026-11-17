// AS-1m (R1.106; P-588; case-side contract v0.1 §2.6, §3.2): the eligibility rules moved to engine/eligibility/ and
// EligibilityPort opened. Each line of the row's test list, a pass and a fail: the import walk (engine/eligibility/ never
// reaches engine/runtime/; the port's files import only zod and their own folder), the old homes re-export the same
// functions, the adapter gives the moved rules' outcomes, the spouse's keys appear only when a gate reads them, an
// unknown release is a typed not-found, and one contract (ports/contracts/eligibility-port.contract.ts) runs against the
// fake and the adapter. The C6.9 suites, the demo reset and the checkpoint load are run as they are by run-suites.sh
// (their files are not changed here). Pure: no server, no database, no model call (US$0).
//   tsx studio/tests/check_as1m_eligibility_move.ts
import ts from "typescript";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import * as moved from "../engine/eligibility/assess.ts";
import * as oldHome from "../engine/runtime/eligibility.ts";
import * as condition from "../engine/eligibility/condition.ts";
import * as render from "../engine/render.ts";
import * as gates from "../engine/eligibility/gates.ts";
import * as eligibilityGates from "../engine/eligibility-gates.ts";
import { kkey, type Known } from "../engine/resolver.ts";
import type { Snapshot } from "../engine/snapshot.ts";
import { EligibilityRefused, type AssessInput } from "../ports/eligibility.port.ts";
import { fakeEligibility, SAMPLE_PROFILES } from "../ports/fakes/eligibility.fake.ts";
import { eligibilityPortContract, type EligibilityHarness } from "../ports/contracts/eligibility-port.contract.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { ConfiguratorEligibility, prismaReleases, type ReleaseReader, type ReleaseRow } from "../api/src/configurator/eligibility.door.ts";

const STUDIO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  AS-1m: ${n}${!c && d !== undefined ? ` — ${JSON.stringify(d).slice(0, 400)}` : ""}`); return !!c; };

// ------------------------------------------------------------------ the import walk (TypeScript compiler API)
/** The value imports of one file: import and export-from declarations that are not type-only, `import x = require()`
 *  and dynamic `import()`. A declaration whose every named binding is `type` is type-only too. */
export function valueImports(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const c = n.importClause;
      const typeOnly = !!c && (c.isTypeOnly || (!c.name && !!c.namedBindings && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly)));
      if (!typeOnly) out.push(n.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const typeOnly = n.isTypeOnly || (!!n.exportClause && ts.isNamedExports(n.exportClause) && n.exportClause.elements.length > 0 && n.exportClause.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) out.push(n.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) && ts.isStringLiteral(n.moduleReference.expression)) {
      if (!n.isTypeOnly) out.push(n.moduleReference.expression.text);
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      out.push(n.arguments[0].text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

type Read = (abs: string) => string | null;
const readDisk: Read = (abs) => (existsSync(abs) ? readFileSync(abs, "utf8") : null);
const resolveFrom = (from: string, spec: string, read: Read) => {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (read(c) !== null) return c;
  return null;
};

/** Every file the entries reach by value imports, and each path that reaches a file under engine/runtime/. */
export function walk(entries: string[], read: Read = readDisk) {
  const runtime = join(STUDIO, "engine", "runtime") + "/";
  const seen = new Set<string>(), bad: string[][] = [], stack = entries.map((e) => [e]);
  while (stack.length) {
    const path = stack.pop()!, f = path[path.length - 1];
    if (seen.has(f)) continue;
    seen.add(f);
    if (f.startsWith(runtime)) { bad.push(path.map((p) => relative(STUDIO, p))); continue; }
    const text = read(f);
    if (text === null) continue;
    for (const spec of valueImports(f, text)) {
      if (!spec.startsWith(".")) continue; // a package (zod, node:*) is never engine/runtime/
      const to = resolveFrom(f, spec, read);
      if (to) stack.push([...path, to]);
    }
  }
  return { reached: [...seen].map((p) => relative(STUDIO, p)), bad };
}

/** The ports rule (contract v0.1 §1 rule 3): a port file imports only zod and files inside ports/ (types included). */
export function portProblems(files: string[], read: Read = readDisk): string[] {
  const ports = join(STUDIO, "ports") + "/", out: string[] = [];
  for (const f of files) {
    const text = read(f);
    if (text === null) { out.push(`${relative(STUDIO, f)}: missing`); continue; }
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
    const all: string[] = [];
    sf.forEachChild((n) => { if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) all.push(n.moduleSpecifier.text); });
    all.push(...valueImports(f, text)); // dynamic import() too
    for (const spec of new Set(all)) {
      if (spec === "zod") continue;
      if (!spec.startsWith(".")) { out.push(`${relative(STUDIO, f)} imports ${spec}`); continue; }
      const to = resolve(dirname(f), spec);
      if (!to.startsWith(ports)) out.push(`${relative(STUDIO, f)} imports ${spec}, outside ports/`);
    }
  }
  return out;
}

const ELIG = join(STUDIO, "engine", "eligibility");
const eligFiles = readdirSync(ELIG).filter((f) => f.endsWith(".ts")).map((f) => join(ELIG, f));
{
  const real = walk(eligFiles);
  ok(`import walk pass: engine/eligibility/ (${eligFiles.length} files, ${real.reached.length} reached) never reaches engine/runtime/`, eligFiles.length >= 3 && real.bad.length === 0, real.bad);
  ok("import walk pass: the walk reaches the resolver and the rules contract (it follows imports)", real.reached.includes("engine/resolver.ts") && real.reached.some((p) => p.endsWith("contracts/rules.ts")), real.reached);
  // The fail case: a test-only file in engine/eligibility/ with one import from engine/runtime/ (held in memory only).
  const probe = join(ELIG, "probe-test-only.ts");
  const withProbe: Read = (abs) => (abs === probe ? 'import { gateOf } from "../runtime/gates.ts";\nexport const x = gateOf;\n' : readDisk(abs));
  const probed = walk([...eligFiles, probe], withProbe);
  ok("import walk fail: a test-only file importing engine/runtime/gates.ts from engine/eligibility/ is caught, with its path", probed.bad.some((p) => p[0] === "engine/eligibility/probe-test-only.ts" && p[p.length - 1] === "engine/runtime/gates.ts"), probed.bad);
  // Reaching it through another file is caught too: render.ts imports engine/runtime/relatives.ts.
  const viaRender: Read = (abs) => (abs === probe ? 'import { render } from "../render.ts";\nexport const x = render;\n' : readDisk(abs));
  const indirect = walk([probe], viaRender);
  ok("import walk fail: a file reaching engine/runtime/ through engine/render.ts is caught", indirect.bad.some((p) => p.includes("engine/render.ts")), indirect.bad);
  const typeOnly: Read = (abs) => (abs === probe ? 'import type { Snapshot } from "../snapshot.ts";\nimport { type Cond } from "../render.ts";\nexport type X = Snapshot | Cond;\n' : readDisk(abs));
  ok("import walk pass: type-only imports (Snapshot, `{ type Cond }`) are not value imports", walk([probe], typeOnly).bad.length === 0 && walk([probe], typeOnly).reached.length === 1);
  // The old placement (the move undone) fails: engine/runtime/eligibility.ts's own imports reached engine/runtime/ via render.ts.
  const oldPlacement: Read = (abs) => (abs === probe ? 'import { evalCondition } from "../render.ts";\nimport { gateFacts } from "../eligibility-gates.ts";\nexport const x = [evalCondition, gateFacts];\n' : readDisk(abs));
  ok("import walk fail: the rules' old imports (render.ts, eligibility-gates.ts) reach engine/runtime/", walk([probe], oldPlacement).bad.length > 0);
}
{
  const portFiles = ["ports/eligibility.port.ts", "ports/fakes/eligibility.fake.ts", "ports/contracts/eligibility-port.contract.ts", "ports/contracts/contract.ts"].map((f) => join(STUDIO, f));
  const real = portProblems(portFiles);
  ok("port pass: the port, its fake and its contract import only zod and ports/", real.length === 0, real);
  const port = portFiles[0];
  const bad: Read = (abs) => (abs === port ? 'import { z } from "zod";\nimport type { Snapshot } from "../engine/snapshot.ts";\nimport { readFileSync } from "node:fs";\n' : readDisk(abs));
  const got = portProblems([port], bad);
  ok("port fail: a port importing engine/ (even type-only) or node:fs is caught", got.length === 2 && got.some((x) => x.includes("../engine/snapshot.ts")) && got.some((x) => x.includes("node:fs")), got);
}

// ------------------------------------------------------------------ the old homes re-export the moved code
{
  const names = (m: object) => Object.keys(m).sort().join(",");
  ok("re-export pass: engine/runtime/eligibility.ts gives the same names and the same functions as engine/eligibility/assess.ts", names(oldHome) === names(moved) && Object.keys(moved).every((k) => (oldHome as Record<string, unknown>)[k] === (moved as Record<string, unknown>)[k]), { old: names(oldHome), moved: names(moved) });
  ok("re-export pass: engine/render.ts's evalCondition is engine/eligibility/condition.ts's", render.evalCondition === condition.evalCondition);
  ok("re-export pass: engine/eligibility-gates.ts's gateFacts is engine/eligibility/gates.ts's", eligibilityGates.gateFacts === gates.gateFacts);
  const oldText = readFileSync(join(STUDIO, "engine/runtime/eligibility.ts"), "utf8");
  ok("re-export fail: engine/runtime/eligibility.ts holds no rule of its own (one re-export line, nothing else)", valueImports("x.ts", oldText).join() === "../eligibility/assess.ts" && !/\bfunction\b|=>/.test(oldText.replace(/^\/\/.*$/gm, "")), oldText);
  const importers = ["api/src/assessments.ts", "engine/answer-keys.ts"].map((f) => [f, valueImports(f, readFileSync(join(STUDIO, f), "utf8"))] as const);
  ok("switch pass: api/src/assessments.ts and engine/answer-keys.ts import the rules from engine/eligibility/assess.ts, not engine/runtime/eligibility.ts", importers.every(([, i]) => i.some((s) => s.endsWith("eligibility/assess.ts")) && !i.some((s) => s.endsWith("runtime/eligibility.ts"))), importers);
}

// ------------------------------------------------------------------ fixtures for the adapter
const PERSON_GATES = [
  { key: "t.document", label: "A travel document (Sample)", condition: { subjectKind: "PERSON", op: "exists", field: "person.passport_number" } },
  { key: "t.history", label: "No criminal history (Sample)", condition: { subjectKind: "PERSON", op: "eq", field: "person.criminal_history", value: false } },
  { key: "t.ties", label: "Ties reviewed (Sample)", condition: { subjectKind: "PERSON", op: "eq", field: "person.ties", value: true }, whenNotMet: "needs_review" as const },
];
const SPOUSE_GATE = { key: "t.spouse_language", label: "The spouse's language test (Sample)", condition: { subjectKind: "SPOUSE", op: "exists", field: "person.language_level" } };
const FIELDS = [
  { id: "person.passport_number", meaning: "Passport number (Sample)", value_type: "text" },
  { id: "person.criminal_history", meaning: "Has a criminal history (Sample)", value_type: "yes_no" },
  { id: "person.ties", meaning: "Ties to home (Sample)", value_type: "yes_no" },
  { id: "person.language_level", meaning: "Language test level (Sample)", value_type: "single_choice", answer_list: { key: "sample_levels", values: [{ key: "low", label: "Low" }, { key: "high", label: "High" }] } },
];
const snapOf = (label: string, g: unknown[]) => ({ combination: { key: label.toLowerCase(), label }, derived_fields: [], canonical_fields: FIELDS, eligibility: g.length ? { gates: g, judgement: [], disclaimer: "Indicative only (Sample disclaimer for this check)." } : undefined }) as unknown as Snapshot;
const W1 = "11111111-1111-4111-8111-111111111111", W2 = "22222222-2222-4222-8222-222222222222";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ROWS: (ReleaseRow & { workspaceId: string })[] = [
  { workspaceId: W1, id: id(1), combinationId: id(101), version: 1, status: "SUPERSEDED", sha256: "hash-a1", snapshot: snapOf("Sample A", PERSON_GATES.slice(0, 1)) },
  { workspaceId: W1, id: id(2), combinationId: id(101), version: 2, status: "RELEASED", sha256: "hash-a2", snapshot: snapOf("Sample A", PERSON_GATES) },
  { workspaceId: W1, id: id(3), combinationId: id(102), version: 1, status: "RELEASED", sha256: "hash-b1", snapshot: snapOf("Sample B", [...PERSON_GATES.slice(0, 1), SPOUSE_GATE]) },
  { workspaceId: W1, id: id(4), combinationId: id(103), version: 1, status: "RELEASED", sha256: "hash-c1", snapshot: snapOf("Sample C, no rules", []) },
  { workspaceId: W2, id: id(5), combinationId: id(104), version: 1, status: "RELEASED", sha256: "hash-d1", snapshot: snapOf("Sample D, other firm", PERSON_GATES) },
];
/** The in-memory release table, read through the adapter's own Prisma reader (prismaReleases): the same where clauses. */
const calls: unknown[] = [];
const match = (row: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => row[k] === v);
const table = {
  async findMany(a: { where: Record<string, unknown> }) { calls.push(a); return ROWS.filter((r) => match(r, a.where)).sort((x, y) => x.combinationId.localeCompare(y.combinationId) || y.version - x.version); },
  async findFirst(a: { where: Record<string, unknown> }) { calls.push(a); return ROWS.find((r) => match(r, a.where)) ?? null; },
};
const reader = (ws: string): ReleaseReader => prismaReleases({ configRelease: table }, ws);
const door = (ws = W1) => new ConfiguratorEligibility(reader(ws));
const A = id(2), B = id(3), C = id(4);
const P = (known: Record<string, unknown>, spouse?: Record<string, unknown>): AssessInput["persons"] => [{ role: "principal", known }, ...(spouse ? [{ role: "spouse" as const, known: spouse }] : [])];
const FULL = { "person.passport_number": "SAMPLEP12", "person.criminal_history": false, "person.ties": true };

// ------------------------------------------------------------------ the adapter gives the moved rules' outcomes
{
  const s = ROWS[1].snapshot as Snapshot;
  const knownOf = (facts: Record<string, unknown>): Known => new Map(Object.entries(facts).map(([f, value]) => [kkey("principal", f), { value, status: "answered" as const, source: "check" }]));
  const profiles: [string, Record<string, unknown>][] = [["every gate met", FULL], ["passport missing", { ...FULL, "person.passport_number": "" }], ["history not met", { ...FULL, "person.criminal_history": true }], ["ties not met (review)", { ...FULL, "person.ties": false }], ["nothing answered", {}], ["not met and missing", { "person.criminal_history": true }]];
  const same: string[] = [];
  for (const [what, facts] of profiles) {
    const r = await door().assess({ release_id: A, persons: P(facts) }), m = moved.assess(s, knownOf(facts), "principal")!;
    if (r.outcome === m.outcome && JSON.stringify(r.missing_facts.map((x) => x.key)) === JSON.stringify(m.missingInputs) && JSON.stringify(r.reasons.filter((x) => x.kind === "GATE_NOT_MET").map((x) => x.ref)) === JSON.stringify(m.failedGates) && JSON.stringify(r.reasons.filter((x) => x.kind === "GATE_NEEDS_REVIEW").map((x) => x.ref)) === JSON.stringify(m.reviewGates)) same.push(what);
    else ok(`same outcomes: ${what}`, false, { port: r, moved: { outcome: m.outcome, missing: m.missingInputs, failed: m.failedGates, review: m.reviewGates } });
  }
  ok(`same outcomes pass: the adapter's outcome, missing facts, failed and review gates equal the moved assess() on ${profiles.length} profiles`, same.length === profiles.length, same);
  const outcomes = new Set(await Promise.all(profiles.map(async ([, f]) => (await door().assess({ release_id: A, persons: P(f) })).outcome)));
  ok("same outcomes pass: the profiles cover all three outcomes", outcomes.size === 3, [...outcomes]);
  const r = await door().assess({ release_id: A, persons: P({ ...FULL, "person.criminal_history": true }) });
  ok("same outcomes fail: a rule not met gives NOT_ELIGIBLE naming it, with the release's hash and disclaimer", r.outcome === "NOT_ELIGIBLE" && r.reasons.some((x) => x.kind === "GATE_NOT_MET" && x.ref === "t.history" && x.words === "No criminal history (Sample)") && r.rules_version.content_hash === "hash-a2" && r.disclaimer.startsWith("Indicative only") && r.scores.length === 0, r);
  const m = await door().assess({ release_id: A, persons: P({ "person.criminal_history": false, "person.ties": true }) });
  ok("same outcomes fail: a missing fact gives POSSIBLY_ELIGIBLE with the fact named in the question's words, never NOT_ELIGIBLE", m.outcome === "POSSIBLY_ELIGIBLE" && m.missing_facts.length === 1 && m.missing_facts[0].key === "person.passport_number" && m.reasons.some((x) => x.kind === "FACT_MISSING" && x.words === "Passport number (Sample)"), m);
}

// ------------------------------------------------------------------ the spouse's keys only when a gate reads them
{
  const a = await door().requiredFacts(A), b = await door().requiredFacts(B);
  ok("spouse pass: a release whose gates are all per person lists no spouse key", a.facts.length === 3 && a.facts.every((f) => f.role === "principal"), a);
  ok("spouse fail: a release with a spouse's gate lists that key for the spouse, with its words and allowed values", b.facts.some((f) => f.role === "spouse" && f.key === "person.language_level" && f.wording === "Language test level (Sample)" && JSON.stringify(f.allowed_values) === '["low","high"]') && b.facts.filter((f) => f.role === "spouse").length === 1, b);
  const noSpouse = await door().assess({ release_id: B, persons: P(FULL) });
  const spouseMissing = await door().assess({ release_id: B, persons: P(FULL, {}) });
  const spouseMet = await door().assess({ release_id: B, persons: P(FULL, { "person.language_level": "high" }) });
  ok("spouse pass: the spouse's gate reads the spouse's facts: met with them, missing without, and not applied with no spouse", noSpouse.outcome === "LIKELY_ELIGIBLE" && spouseMet.outcome === "LIKELY_ELIGIBLE" && spouseMissing.outcome === "POSSIBLY_ELIGIBLE" && spouseMissing.missing_facts.some((x) => x.role === "spouse" && x.key === "person.language_level"), { noSpouse, spouseMissing, spouseMet });
  const principalOnly = await door().assess({ release_id: B, persons: P({ ...FULL, "person.language_level": "high" }, {}) });
  ok("spouse fail: the principal's own answer never fills the spouse's gate", principalOnly.outcome === "POSSIBLY_ELIGIBLE", principalOnly);
  const fakeVisit = await fakeEligibility().requiredFacts("sample-release-visit-1"), fakePoints = await fakeEligibility().requiredFacts("sample-release-points-2");
  ok("spouse pass (fake): the Sample visit lists no spouse key; the Sample points grid lists one", fakeVisit.facts.every((f) => f.role === "principal") && fakePoints.facts.some((f) => f.role === "spouse"), { fakeVisit, fakePoints });
}

// ------------------------------------------------------------------ an unknown release is a typed not-found
{
  const refusal = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return e; } };
  const unknown = await refusal(() => door().assess({ release_id: id(999), persons: P(FULL) }));
  ok("not-found pass: assess on an unknown release throws EligibilityRefused RELEASE_NOT_FOUND", unknown instanceof EligibilityRefused && unknown.code === "RELEASE_NOT_FOUND" && unknown.releaseId === id(999), String(unknown));
  const other = await refusal(() => door(W2).assess({ release_id: A, persons: P(FULL) }));
  ok("not-found pass: another firm's release is not found (the reader is bound to the caller's firm)", other instanceof EligibilityRefused && other.code === "RELEASE_NOT_FOUND", String(other));
  const before = calls.length, bad = await refusal(() => door().requiredFacts("not-a-uuid"));
  ok("not-found pass: a malformed id is not found without a database read", bad instanceof EligibilityRefused && bad.code === "RELEASE_NOT_FOUND" && calls.length === before, String(bad));
  const noRules = await refusal(() => door().assess({ release_id: C, persons: P(FULL) }));
  ok("not-found fail: a release that exists with no rules is a different refusal (NO_RULES), never a result", noRules instanceof EligibilityRefused && noRules.code === "NO_RULES", String(noRules));
  const bodyBad = await refusal(() => door().assess({ release_id: id(999), persons: [] } as never));
  ok("not-found fail: a malformed input is a ZodError before the release is looked up", bodyBad instanceof z.ZodError, String(bodyBad));
  const list = await door().listAssessable();
  ok("list pass: one row per combination with rules, its newest released version; none without rules, none of another firm", JSON.stringify(list.map((x) => [x.name, x.release_id, x.version, x.content_hash])) === JSON.stringify([["Sample A", A, 2, "hash-a2"], ["Sample B", B, 1, "hash-b1"]]), list);
  ok("list fail: the reader asks only for the firm's RELEASED rows (a superseded release is never listed)", calls.some((c) => JSON.stringify((c as { where: unknown }).where) === JSON.stringify({ workspaceId: W1, status: "RELEASED" })) && !list.some((x) => x.release_id === id(1)), calls[0]);
}

// ------------------------------------------------------------------ one contract, the fake and the adapter
{
  const fake = (): EligibilityHarness => ({ port: fakeEligibility(), other: fakeEligibility([]), profiles: SAMPLE_PROFILES });
  const adapter = (): EligibilityHarness => ({
    port: door(W1), other: door(W2),
    profiles: {
      likely: { release_id: A, persons: P(FULL) },
      possibly: { release_id: A, persons: P({ ...FULL, "person.passport_number": null }) },
      not: { release_id: A, persons: P({ ...FULL, "person.criminal_history": true }) },
    },
  });
  const f = await runContract(eligibilityPortContract, "fakeEligibility", fake, (n, c, d) => ok(`contract ${n}`, c, d));
  const a = await runContract(eligibilityPortContract, "ConfiguratorEligibility", adapter, (n, c, d) => ok(`contract ${n}`, c, d));
  ok("contract pass: the same cases ran against both", f.passed.length === a.passed.length && f.passed.length >= 8, { fake: f.passed.length, adapter: a.passed.length });
  // A fail case: an adapter that answers NOT for a missing fact (the rule AG-3-12 forbids) breaks the contract.
  const broken = (): EligibilityHarness => {
    const h = adapter(), real = h.port;
    return { ...h, port: { ...real, listAssessable: () => real.listAssessable(), requiredFacts: (x) => real.requiredFacts(x), assess: async (i) => { const r = await real.assess(i); return r.outcome === "POSSIBLY_ELIGIBLE" ? { ...r, outcome: "NOT_ELIGIBLE" } : r; } } };
  };
  const b = await runContract(eligibilityPortContract, "BrokenForTheTest", broken, null);
  ok("contract fail: an adapter that answers NOT_ELIGIBLE for a missing fact fails the contract", b.failed.length > 0, b);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
