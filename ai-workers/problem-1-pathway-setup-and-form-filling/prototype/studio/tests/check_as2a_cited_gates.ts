// AS-2a (R1.107, map row 107; P-650 (2), P-607 (9), AGENTS rule 4, P-170; shape: product/screens/AS-2/shape.md): cited
// gates and assessment-only releases. Each rule of the part, a pass and a fail:
//   S  a gate's source is an official page (https url, section, quote, a real date not in the future) or { sample: true };
//   G  on an assessment-only combination every gate needs a source; elsewhere a source stays optional; the flag needs a gate;
//   F  a combination saved before AS-2a keeps its snapshot shape (so its fingerprint); a source and the flag are carried;
//   R  release: an assessment-only draft with gates and no form needs no form or document line; without the flag it does;
//   P  its gate facts need no form placement (they are asked of the person); without the flag they do;
//   C  no case opens on it: one "Assessment only: no forms" line in place of the form lines;
//   W  the change summary shows the source the expert signs, a changed source, and the flag;
//   D  the configurator's door lists the release as assessment only and returns each rule read with its state and source.
// Every value here is Sample (invented keys and rules, example pages); no immigration value (AGENTS rule 4). Pure: no
// server, no database, no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_as2a_cited_gates.ts
import { checkGates, checkSource, eligibilityChanges, gateProblems, snapshotEligibility, ASSESSMENT_ONLY_WORDS } from "../engine/eligibility-gates.ts";
import { missingItems, releaseLineProblems, ASSESSMENT_ONLY_CASE_WORDS } from "../engine/programs.ts";
import { emptyProblem } from "../api/src/studio.ts";
import { ConfiguratorEligibility, type ReleaseRow } from "../api/src/configurator/eligibility.door.ts";
import { EligibilityResult } from "../ports/eligibility.port.ts";
import type { Snapshot } from "../engine/snapshot.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  AS-2a: ${n}${!c && d !== undefined ? ` — ${JSON.stringify(d).slice(0, 400)}` : ""}`); return !!c; };

const TODAY = "2026-11-25";
const CITED = { url: "https://www.example.gov/sample-stream", section: "Eligibility (Sample)", quote: "Sample: must hold a language score of at least 4", date: "2026-11-25" };
const FIELDS = new Map([["person.language_level", "number"], ["person.job_offer", "yes_no"]]);
const NONE = new Set<string>();
const gate = (extra: Record<string, unknown> = {}) => ({ key: "s.language", label: "Language score of at least 4 (Sample)", condition: { op: "gte", field: "person.language_level", value: 4 }, ...extra });
const gate2 = (extra: Record<string, unknown> = {}) => ({ key: "s.job", label: "A job offer (Sample)", condition: { op: "eq", field: "person.job_offer", value: true }, ...extra });

// ------------------------------------------------------------------ S: the source
{
  ok("S pass: an official page with section, quote and the date read is kept as given", JSON.stringify(checkSource(CITED, TODAY).source) === JSON.stringify(CITED), checkSource(CITED, TODAY));
  ok("S pass: { sample: true } is kept as the Sample label", JSON.stringify(checkSource({ sample: true }, TODAY).source) === '{"sample":true}');
  ok("S pass: no source is no source (and no refusal)", JSON.stringify(checkSource(undefined, TODAY)) === "{}");
  const refusals: [string, unknown][] = [
    ["an http page", { ...CITED, url: "http://www.example.gov/x" }],
    ["no page", { ...CITED, url: "" }],
    ["no section", { ...CITED, section: " " }],
    ["no quote", { ...CITED, quote: "" }],
    ["a day that does not exist", { ...CITED, date: "2026-02-30" }],
    ["a date in the future", { ...CITED, date: "2026-11-26" }],
    ["a date not written YYYY-MM-DD", { ...CITED, date: "25 Nov 2026" }],
    ["a page and Sample at once", { ...CITED, sample: true }],
    ["a key that is not part of a source", { ...CITED, page: 3 }],
    ["sample: false", { sample: false }],
    ["a quote holding invisible characters", { ...CITED, quote: "at least​ 4" }],
    ["text in place of a source", "see the page"],
  ];
  for (const [what, raw] of refusals) ok(`S fail: ${what} is refused in words`, !!checkSource(raw, TODAY).problem && !checkSource(raw, TODAY).source, checkSource(raw, TODAY));
}

// ------------------------------------------------------------------ G: a source on every gate of an assessment-only combination
{
  const cited = checkGates({ gates: [gate({ source: CITED }), gate2({ source: { sample: true } })], judgement: [], assessmentOnly: true }, FIELDS, NONE, TODAY);
  ok("G pass: assessment only, every gate cited or Sample → saved, with the flag and each source", !cited.errors.length && cited.assessment_only === true && JSON.stringify(cited.gates.map((g) => g.source)) === JSON.stringify([CITED, { sample: true }]), cited);
  const bare = checkGates({ gates: [gate({ source: CITED }), gate2()], judgement: [], assessmentOnly: true }, FIELDS, NONE, TODAY);
  ok("G fail: assessment only, one gate with no source → refused on that gate's source, naming Assessment only", bare.errors.length === 1 && bare.errors[0].field === "gates.1.source" && bare.errors[0].message.startsWith(ASSESSMENT_ONLY_WORDS), bare.errors);
  const plain = checkGates({ gates: [gate()], judgement: [] }, FIELDS, NONE, TODAY);
  ok("G pass: not assessment only, a gate with no source is saved as before (no source key, no flag)", !plain.errors.length && !("source" in plain.gates[0]) && !("assessment_only" in plain), plain);
  const badSource = checkGates({ gates: [gate({ source: { ...CITED, url: "ftp://x" } })], judgement: [] }, FIELDS, NONE, TODAY);
  ok("G fail: a bad source is refused on any combination", badSource.errors.some((e) => e.field === "gates.0.source"), badSource.errors);
  const empty = checkGates({ gates: [], judgement: [], assessmentOnly: true }, FIELDS, NONE, TODAY);
  ok("G fail: assessment only with no gate → refused (zero gates is no result, BR-10)", empty.errors.some((e) => e.field === "assessmentOnly"), empty.errors);
  const word = checkGates({ gates: [gate({ source: CITED })], judgement: [], assessmentOnly: "yes" }, FIELDS, NONE, TODAY);
  ok("G fail: assessment only given as text → refused", word.errors.some((e) => e.field === "assessmentOnly"), word.errors);
  const off = checkGates({ gates: [gate({ source: CITED })], judgement: [], assessmentOnly: false }, FIELDS, NONE, TODAY);
  ok("G pass: assessment only false is stored as no flag", !off.errors.length && !("assessment_only" in off), off);
}

// ------------------------------------------------------------------ F: fingerprints, and what a release carries
const stored = (gates: unknown[], flag?: true) => ({ gates, judgement: [], disclaimer: null, version: 1, by: "x", at: "2026-11-25T00:00:00Z", ...(flag ? { assessment_only: flag } : {}) });
{
  const before = checkGates({ gates: [gate(), gate2({ whenNotMet: "needs_review" })], judgement: [] }, FIELDS, NONE, TODAY).gates;
  const snap = snapshotEligibility(stored(before));
  // The shape a release made before AS-2a carried, written out: any new key would change its content hash.
  const old = { gates: [{ key: "s.language", label: "Language score of at least 4 (Sample)", condition: { op: "gte", field: "person.language_level", value: 4, subjectKind: "PERSON" } }, { key: "s.job", label: "A job offer (Sample)", condition: { op: "eq", field: "person.job_offer", value: true, subjectKind: "PERSON" }, whenNotMet: "needs_review" }], judgement: [], disclaimer: snap?.disclaimer };
  ok("F pass: a combination saved without a source or the flag gives the same snapshot as before AS-2a (fingerprint unchanged)", JSON.stringify(snap) === JSON.stringify(old), { snap, old });
  const cited = snapshotEligibility(stored([{ ...before[0], source: CITED }], true));
  ok("F pass: a source and the flag are carried into the release", JSON.stringify(cited?.gates[0].source) === JSON.stringify(CITED) && cited?.assessment_only === true, cited);
  ok("F fail: a changed source changes what the release carries (so its hash)", JSON.stringify(snapshotEligibility(stored([{ ...before[0], source: { ...CITED, date: "2026-11-24" } }], true))) !== JSON.stringify(cited));
}

// ------------------------------------------------------------------ R, C: release and Open a case
const elig = (flag: boolean) => snapshotEligibility(stored([{ ...gate({ source: CITED }), condition: { ...gate().condition, subjectKind: "PERSON" } }], flag ? true : undefined));
const snapOf = (flag: boolean, forms: unknown[] = []) => ({ forms, document_requirements: [], field_maps: [], placements: [], eligibility: elig(flag) }) as unknown as Snapshot;
{
  ok("R pass: assessment only with a gate and no form → no form or document line needed, and not empty", !releaseLineProblems(snapOf(true)).length && !emptyProblem(snapOf(true)).length, { lines: releaseLineProblems(snapOf(true)), empty: emptyProblem(snapOf(true)) });
  ok("R fail: the same draft without the flag is held as empty (nothing to release)", emptyProblem(snapOf(false)).length === 1, emptyProblem(snapOf(false)));
  const withForm = snapOf(true, [{ form_number: "S-1", form_kind: "information", title: "Sample", channel: "PAPER" }]);
  ok("R fail: the flag never excuses a draft that has forms: its form and document lines are still checked", releaseLineProblems(withForm).length > 0, releaseLineProblems(withForm));
  const m = missingItems(snapOf(true), [], []);
  ok("C pass: no case opens on an assessment-only release: one line, in its words", m.length === 1 && m[0].code === "assessment_only" && m[0].text === ASSESSMENT_ONLY_CASE_WORDS && ASSESSMENT_ONLY_CASE_WORDS.startsWith("Assessment only: no forms"), m);
  const m2 = missingItems(snapOf(false), [], []);
  ok("C fail: without the flag, a release with no form gives the no-forms line, not the assessment-only one", m2.some((x) => x.code === "no_forms") && !m2.some((x) => x.code === "assessment_only"), m2);
}

// ------------------------------------------------------------------ P: gate facts are asked of the person, not placed on a form
{
  const words = (f: string) => `"${f}"`;
  const onlyP = gateProblems(elig(true), new Set(), new Set(), FIELDS, NONE, words);
  ok("P pass: assessment only, a gate fact no form places → no release error", !onlyP.length, onlyP);
  const formP = gateProblems(elig(false), new Set(), new Set(), FIELDS, NONE, words);
  ok("P fail: without the flag, the same gate fact is refused (no case is asked it, P-62)", formP.length === 1 && /no case of this application is asked/.test(formP[0].message), formP);
  const derived = gateProblems({ ...elig(true)!, gates: [{ key: "s.points", label: "Points (Sample)", condition: { subjectKind: "PERSON", op: "gte", field: "derived.points", value: 60 }, source: { sample: true } }] }, new Set(), new Set(), FIELDS, new Set(["derived.points"]), words);
  ok("P fail: assessment only still refuses a worked-out value as a gate fact", derived.length === 1 && /worked out/.test(derived[0].message), derived);
}

// ------------------------------------------------------------------ W: the change summary the expert signs
{
  const a = snapshotEligibility(stored([{ ...gate(), source: CITED }], true));
  const added = eligibilityChanges(undefined, a);
  ok("W pass: an added gate's line shows its page, section, date and the words quoted; the flag has its own line", added.some((l) => l.key === "s.language" && l.label.includes(CITED.url) && l.label.includes(CITED.quote) && l.label.includes(CITED.date)) && added.some((l) => l.key === "assessment_only" && l.label.startsWith(ASSESSMENT_ONLY_WORDS)), added);
  const b = snapshotEligibility(stored([{ ...gate(), source: { sample: true } }], true));
  const changed = eligibilityChanges(a, b);
  ok("W pass: a changed source is a changed line saying so (now Sample)", changed.length === 1 && changed[0].change === "changed" && /source changed — source: Sample/.test(changed[0].label), changed);
  ok("W fail: the same gates and source give no line", eligibilityChanges(a, snapshotEligibility(stored([{ ...gate(), source: CITED }], true))).length === 0);
  const unflag = eligibilityChanges(a, snapshotEligibility(stored([{ ...gate(), source: CITED }])));
  ok("W pass: removing the flag is its own line", unflag.length === 1 && unflag[0].key === "assessment_only" && unflag[0].change === "removed", unflag);
}

// ------------------------------------------------------------------ D: the door
{
  const fields = [{ id: "person.language_level", meaning: "Language score (Sample)", value_type: "number" }, { id: "person.job_offer", meaning: "Has a job offer (Sample)", value_type: "yes_no" }];
  const snap = (label: string, e: unknown) => ({ combination: { key: label.toLowerCase(), label }, derived_fields: [], canonical_fields: fields, eligibility: e }) as unknown as Snapshot;
  const both = [{ ...gate(), condition: { ...gate().condition, subjectKind: "PERSON" }, source: CITED }, { ...gate2(), condition: { ...gate2().condition, subjectKind: "PERSON" } }];
  const rows: ReleaseRow[] = [
    { id: "00000000-0000-4000-8000-000000000001", combinationId: "c1", version: 1, status: "RELEASED", sha256: "h1", snapshot: snap("Sample stream", snapshotEligibility(stored(both, true))) },
    { id: "00000000-0000-4000-8000-000000000002", combinationId: "c2", version: 1, status: "RELEASED", sha256: "h2", snapshot: snap("Sample filing", snapshotEligibility(stored(both))) },
  ];
  const door = new ConfiguratorEligibility({ released: async () => rows, byId: async (id) => rows.find((r) => r.id === id) ?? null });
  const list = await door.listAssessable();
  ok("D pass: the door lists the assessment-only release as such, and the other one not", list.find((x) => x.name === "Sample stream")?.assessment_only === true && list.find((x) => x.name === "Sample filing")?.assessment_only === false, list);
  const yes = await door.assess({ release_id: rows[0].id, persons: [{ role: "principal", known: { "person.language_level": 5, "person.job_offer": true } }] });
  ok("D pass: Likely eligible lists every rule met, the cited one with its page and quote, the uncited one with none", EligibilityResult.safeParse(yes).success && yes.outcome === "LIKELY_ELIGIBLE" && yes.rules.length === 2 && yes.rules.every((r) => r.state === "met") && JSON.stringify(yes.rules[0].source) === JSON.stringify(CITED) && yes.rules[1].source === null, yes.rules);
  const no = await door.assess({ release_id: rows[0].id, persons: [{ role: "principal", known: { "person.language_level": 3, "person.job_offer": true } }] });
  ok("D fail: a score below the rule gives Not eligible, the failed rule a not-met line carrying its quote", no.outcome === "NOT_ELIGIBLE" && no.rules.find((r) => r.ref === "s.language")?.state === "not_met" && (no.rules.find((r) => r.ref === "s.language")?.source as { quote?: string })?.quote === CITED.quote, no.rules);
  const half = await door.assess({ release_id: rows[0].id, persons: [{ role: "principal", known: { "person.job_offer": true } }] });
  ok("D fail: an unanswered fact gives Possibly eligible and a not-answered line, never not met", half.outcome === "POSSIBLY_ELIGIBLE" && half.rules.find((r) => r.ref === "s.language")?.state === "not_answered", half.rules);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
