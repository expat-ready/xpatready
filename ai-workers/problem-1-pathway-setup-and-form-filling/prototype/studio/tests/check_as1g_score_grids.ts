// AS-1g checks (R1.106; AG-3-5, AG-3-6, AG-3-7, AG-3-17, AG-3-18, AG-3-19; BR-1 to BR-3; P-577, P-588 (1), AGENTS rule 4):
// score grids as cited data on a release, end to end on the suites' fixture, each rule with a pass and a fail: a row with
// neither source_ref nor Sample is refused at import (and by the database); the app role cannot write the tables; a
// snapshot carries its grids and its hash changes with one point value; a case pinned to release 1 keeps release 1's
// grid after release 2 (P-496 (1)); two overlapping bands for one fact are refused at import; no score or pass-mark
// number appears in api/src or engine code (P-319's guard pattern). Every value here is Sample (test words), never an
// IRCC value: the cited Express Entry grids are AS-1c's. Rules only, no AI (US$0).
//   zsh studio/tools/isolated.sh runtime_as1g 4436 start && tsx studio/tests/check_as1g_score_grids.ts 4436 xr_studio_runtime_as1g
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { sourceEveryNumber } from "./fixtures/source-every-number.cjs";

const PORT = Number(process.argv[2] ?? 4436), DB = process.argv[3] ?? "xr_studio_runtime_as1g";
let pass = 0, fail = 0;
const ok = (name: string, c: boolean, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 260)}` : ""}`); };
const call = async (method: string, path: string, body?: unknown, actor = "user-A") => {
  const r = await fetch(`http://localhost:${PORT}/api${path}`, { method, headers: { "x-actor": actor, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const PSQL = "/opt/homebrew/opt/postgresql@18/bin/psql";
const as = (role: string, q: string) => execFileSync(PSQL, [`postgresql://${role}@127.0.0.1:54329/${DB}`, "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => as("xr_studio", q);
const fails = (role: string, q: string) => { try { as(role, q); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };
const words = (r: { body: any }) => String(r.body?.detail ?? r.body?.message ?? "");

// The fixture grid: Sample throughout (test words, not IRCC's values).
const KEY = "as1g.sample_grid";
const OFFICER = "user-O";   // a case officer opens the case (the configuration people hold no case duty)
const age = (lo: number, hi: number | null, points: number) => ({ when: hi === null ? { op: "gte", field: "person.sample_age", value: lo } : { op: "and", args: [{ op: "gte", field: "person.sample_age", value: lo }, { op: "lt", field: "person.sample_age", value: hi }] }, points, source_ref: "Sample" });
const grid = (agePoints = 10) => ({
  key: KEY, label: "AS-1g sample grid (test)", selection_model: "FIXED_PASS_MARK", pass_mark: 6, maximum: 20, combinations: ["wp.family"], source_ref: "Sample",
  factors: [
    { key: "age", role: "PRINCIPAL", facts: ["person.sample_age"], maximum: 10, source_ref: "Sample", bands: [age(18, 36, agePoints), age(36, null, 5)] },
    { key: "language", role: "SPOUSE", facts: ["person.sample_clb"], maximum: 10, source_ref: { url: "https://example.org/test-page", section: "Test section 1", quote: "Test words (fixture): CLB 7 gives the points.", date: "2026-11-24" },
      bands: [{ when: { op: "in", field: "person.sample_clb", value: [7, 8] }, points: 4, source_ref: "Sample" }, { when: { op: "gte", field: "person.sample_clb", value: 9 }, points: 6, source_ref: "Sample" }] },
  ],
  language_conversion: [{ test: "SAMPLE_TEST", skill: "READING", score_min: 0, score_max: 4.5, clb: 4, source_ref: "Sample" }, { test: "SAMPLE_TEST", skill: "READING", score_min: 5, score_max: 9, clb: 7, source_ref: "Sample" }],
});
const propose = (g: unknown, actor = "user-A") => call("POST", "/library/score-grids", { grid: g, reason: "Test: import the AS-1g sample grid." }, actor);
const approve = (id: string, actor = "user-B") => call("POST", `/library/changes/${id}/approve`, { note: "Second person (AS-1g check)." }, actor);
async function release(wp: string) {
  await sourceEveryNumber(PORT, wp);
  await call("POST", `/combinations/${wp}/submit`, {});
  const review = (await call("GET", `/combinations/${wp}/review`)).body;
  const sme = ((review.submission?.changeSummary ?? []) as any[]).filter((x) => x.needs_sme).map((x) => `${x.kind}|${x.key}`);
  if (sme.length) await call("POST", `/combinations/${wp}/signoff`, { items: sme, action: "signed" }, "user-C");
  return call("POST", `/combinations/${wp}/approve`, {}, "user-B");
}
const latest = (wp: string) => sql(`select id || '|' || sha256 from config_release where combination_id='${wp}' order by version desc limit 1`).split("|");
const pointsIn = (releaseId: string) => sql(`select snapshot->'score_grids'->0->'factors'->0->'bands'->0->>'points' from config_release where id='${releaseId}'`);

(async () => {
  const served = (await call("GET", "/session")).body?.workspace?.id;
  const inDb = (() => { try { return sql(`select id from workspace where id='${served}'`); } catch { return ""; } })();
  if (!served || !inDb) { console.error(`STOP  the database ${DB} is not the one the server on port ${PORT} uses. Pass the copy's database: tsx <check> ${PORT} xr_studio_<name>.`); process.exit(2); }
  // Measured right after its own migration (Amendment 6): the tables exist, nothing is in them but this suite's own rows.
  ok("AS-1g pass (migration): the four grid tables exist with their cited-or-Sample checks", sql(`select count(*) from pg_constraint where conname in ('score_ruleset_cited','score_factor_cited','score_band_cited','language_conversion_cited')`) === "4");
  sql(`delete from score_ruleset where key like 'as1g.%'`);   // platform-wide rows the demo reset does not touch: this suite's own, from an earlier run
  await call("POST", "/demo/reset", { confirm: "RESET" });
  const l = await call("POST", "/demo/load", {});
  if (l.status >= 300) { console.error("STOP  the sample did not load", l.body); process.exit(2); }
  const wp = sql(`select id from combination where combination_key='wp.family'`);
  if (!wp) { console.error("STOP  the fixture has no wp.family"); process.exit(2); }
  const draft0 = (await call("GET", `/combinations/${wp}/config?mode=draft`)).body?.snapshot;
  ok("AS-1g pass (no grid): a combination no grid names writes no score_grids key (its fingerprint as before)", draft0 && !("score_grids" in draft0), Object.keys(draft0 ?? {}).length);

  // 1. A row with neither source_ref nor Sample is refused at import; nothing is proposed.
  const bare = grid(); delete (bare.factors[0].bands[1] as { source_ref?: unknown }).source_ref;
  let r = await propose(bare);
  ok("AS-1g fail (uncited): a band with neither source_ref nor Sample is refused (400 GRID_UNCITED), nothing proposed", r.status === 400 && r.body?.code === "GRID_UNCITED" && sql(`select count(*) from library_change where kind='score_grid'`) === "0", [r.status, r.body?.code, words(r)]);
  const half = grid(); (half.factors[1] as any).source_ref = { url: "https://example.org/x", section: "s", quote: "", date: "2026-11-24" };
  r = await propose(half);
  ok("AS-1g fail (uncited): a source_ref with an empty quote is no citation (400)", r.status === 400, [r.status, words(r)]);
  ok("AS-1g fail (uncited, database): a row neither cited nor Sample is refused by the table's check", /score_ruleset_cited/.test(fails("xr_studio", `insert into score_ruleset (id, key, label, selection_model, pass_mark, maximum, combination_keys, sample, import_sha256, imported_by) values (gen_random_uuid(), 'as1g.bare', 'bare', 'DRAW_RANKING', null, 10, '{wp.family}', false, 'x', 'test')`)));
  ok("AS-1g pass (Sample, database): the same row labelled Sample is accepted (the suite's owner role)", fails("xr_studio", `insert into score_ruleset (id, key, label, selection_model, pass_mark, maximum, combination_keys, sample, import_sha256, imported_by) values (gen_random_uuid(), 'as1g.bare', 'bare', 'DRAW_RANKING', null, 10, '{wp.nothing}', true, 'x', 'test')`) === "");

  // 2. The app role cannot write the tables (the write wall, P-588 (1)); it reads them.
  ok("AS-1g pass (wall): the app role xr_app reads the grid tables", fails("xr_app", `select count(*) from score_ruleset; select count(*) from score_factor; select count(*) from score_band; select count(*) from language_conversion`) === "");
  const denied = ["insert into score_ruleset (id, key, label, selection_model, maximum, sample, import_sha256, imported_by) values (gen_random_uuid(), 'as1g.app', 'x', 'DRAW_RANKING', 10, true, 'x', 'x')", "update score_ruleset set label = 'x' where key = 'as1g.bare'", "delete from score_ruleset where key = 'as1g.bare'", "truncate score_band"].map((q) => fails("xr_app", q));
  ok("AS-1g fail (wall): the app role cannot insert, update, delete or truncate a grid table (permission denied)", denied.every((e) => /permission denied/.test(e)), denied.map((e) => e.slice(0, 60)));
  ok("AS-1g pass (wall): only the named bypass role writes them (the app reaches it by SET ROLE, as asBypass does)", fails("xr_app", `set role xr_staff_bypass; update score_ruleset set label = 'bare (bypass)' where key = 'as1g.bare'`) === "");
  sql(`delete from score_ruleset where key = 'as1g.bare'`);

  // 3. Two overlapping bands for one fact are refused at import; ranges that only touch are not.
  const clash = grid(); clash.factors[0].bands[1] = age(30, null, 5);
  r = await propose(clash);
  ok("AS-1g fail (overlap): bands 18-36 and 30+ for one fact are refused (400 GRID_OVERLAP), nothing proposed", r.status === 400 && r.body?.code === "GRID_OVERLAP" && /bands 1 and 2 overlap/.test(words(r)) && sql(`select count(*) from library_change where kind='score_grid'`) === "0", [r.status, r.body?.code, words(r)]);
  const point = grid(); point.factors[1].bands[1] = { when: { op: "eq", field: "person.sample_clb", value: 8 }, points: 6, source_ref: "Sample" };
  r = await propose(point);
  ok("AS-1g fail (overlap): a value already in another band's list is refused", r.status === 400 && r.body?.code === "GRID_OVERLAP", [r.status, words(r)]);
  const lang = grid(); lang.language_conversion[1].score_min = 4.5;
  r = await propose(lang);
  ok("AS-1g fail (overlap): two language rows whose ranges meet at 4.5 are refused (one score, two CLB levels)", r.status === 400 && /overlaps row 1/.test(words(r)), words(r));
  const stray = grid(); (stray.factors[0].bands[0].when as any).args[0].field = "person.other";
  r = await propose(stray);
  ok("AS-1g fail (condition): a band that reads a fact its factor does not name is refused", r.status === 400 && /not one of the factor's facts/.test(words(r)), words(r));
  r = await propose(grid(), "user-R");
  ok("AS-1g fail (duty): a person without the author duty cannot propose (403)", r.status === 403 || r.status === 401, r.status);

  // 4. Proposed (bands 18-36 and 36+ touch, never overlap), approved by a second person, written on the bypass use.
  r = await propose(grid());
  const id1 = r.body?.id;
  ok("AS-1g pass: the Sample grid (touching ranges, a cited factor) is proposed and waits; nothing written yet", r.status < 300 && sql(`select status from library_change where id='${id1}'`) === "WAITING" && sql(`select count(*) from score_ruleset where key='${KEY}'`) === "0", r.status >= 300 ? words(r) : r.body?.label);
  const self = await approve(id1, "user-A");
  ok("AS-1g fail: the proposer cannot approve their own import", self.status >= 400 && sql(`select status from library_change where id='${id1}'`) === "WAITING", [self.status, words(self)]);
  r = await approve(id1);
  ok("AS-1g pass: a second person's approval writes the grid (2 factors, 4 bands, 2 language rows) and the change waits for the release", r.status < 300 && sql(`select (select count(*) from score_factor f join score_ruleset s on s.id = f.ruleset_id where s.key='${KEY}') || '|' || (select count(*) from score_band b join score_factor f on f.id = b.factor_id join score_ruleset s on s.id = f.ruleset_id where s.key='${KEY}') || '|' || (select count(*) from language_conversion c join score_ruleset s on s.id = c.ruleset_id where s.key='${KEY}')`) === "2|4|2" && sql(`select status from library_change where id='${id1}'`) === "APPROVED", [r.status, words(r)]);
  ok("AS-1g pass: the proposal and the approval each wrote one audit line on the grid", sql(`select count(*) from audit_event where entity='score grid' and entity_key='${KEY}' and action in ('proposed','approved')`) === "2");
  const listed = (await call("GET", "/library/score-grids", undefined, "user-B")).body?.grids?.find((x: any) => x.key === KEY);
  ok("AS-1g pass: the library lists the grid back in the file's shape (Sample rows read \"Sample\", the cited one its source)", listed?.factors?.[0]?.bands?.[0]?.source_ref === "Sample" && listed?.factors?.[1]?.source_ref?.quote?.startsWith("Test words") && listed?.language_conversion?.length === 2, listed?.factors?.[1]?.source_ref);

  // 5. The snapshot carries its grid; the release freezes it; its hash changes with one point value.
  const [rel0, sha0] = latest(wp);
  const draft1 = (await call("GET", `/combinations/${wp}/config?mode=draft`)).body;
  ok("AS-1g pass (snapshot): wp.family's draft carries the grid, and the published view does not before a release", draft1?.snapshot?.score_grids?.[0]?.key === KEY && !("score_grids" in ((await call("GET", `/combinations/${wp}/config?mode=published`)).body?.snapshot ?? {})), draft1?.snapshot?.score_grids?.map((g: any) => g.key));
  const lines = ((await call("GET", `/combinations/${wp}`)).body?.draft?.changes ?? []).filter((x: any) => x.kind === "Score grid");
  ok("AS-1g pass (review): the release names the grid once, in words, for the expert's sign-off", lines.length === 1 && lines[0].needs_sme && lines[0].change === "added" && /AS-1g sample grid/.test(lines[0].label), lines);
  r = await release(wp);
  const [rel1, sha1] = latest(wp);
  ok("AS-1g pass (release 1): the release carries the grid (10 points for 18-36) and its fingerprint differs from the release before", r.status < 300 && rel1 !== rel0 && sha1 !== sha0 && pointsIn(rel1) === "10" && pointsIn(rel0) === "", [r.status, words(r), pointsIn(rel1)]);
  ok("AS-1g pass (release 1): the import is released with it", sql(`select status from library_change where id='${id1}'`) === "RELEASED");
  const pub = (await call("GET", `/combinations/${wp}/config?mode=published`)).body;
  ok("AS-1g pass (published view): it reads the release's grid, and its fingerprint is the release's", pub?.snapshot?.score_grids?.[0]?.key === KEY && pub?.release?.sha256 === sha1, [pub?.release?.sha256, sha1]);
  r = await propose(grid());
  ok("AS-1g fail (same file): importing the same grid again changes nothing (409), so the hash is stable", r.status === 409 && /already in the library exactly/.test(words(r)), [r.status, words(r)]);

  // 6. A case opened now is pinned to release 1; one point changes in release 2; the case keeps release 1's grid.
  const open = await call("POST", "/runtime/cases", { combinationId: wp, reference: `AS1G-${Date.now()}`, clientActor: "user-Q", principal: { displayName: "Sample Applicant A" } }, OFFICER);
  const caseId = open.body?.id ?? open.body?.case?.id;
  ok("AS-1g pass (pin): a case opened after release 1 is pinned to it", !!caseId && sql(`select config_release_id from pack_work_pin where case_id='${caseId}' order by revision desc limit 1`) === rel1, [open.status, words(open)]);
  r = await propose(grid(9));
  r = r.status < 300 ? await approve(r.body.id) : r;
  const draft2 = (await call("GET", `/combinations/${wp}/config?mode=draft`)).body;
  ok("AS-1g fail (one point): one band's points 10 → 9 changes the draft's fingerprint from release 1's", r.status < 300 && draft2?.sha256 && draft2.sha256 !== sha1 && draft2?.snapshot?.score_grids?.[0]?.factors?.[0]?.bands?.[0]?.points === 9, [r.status, words(r), draft2?.sha256?.slice(0, 12)]);
  r = await release(wp);
  const [rel2] = latest(wp);
  ok("AS-1g pass (release 2): release 2 carries 9 points", r.status < 300 && rel2 !== rel1 && pointsIn(rel2) === "9", [r.status, words(r)]);
  ok("AS-1g pass (P-496 (1)): the case is still pinned to release 1, whose grid still gives 10 points", sql(`select config_release_id from pack_work_pin where case_id='${caseId}' order by revision desc limit 1`) === rel1 && pointsIn(rel1) === "10");

  // 7. No score or pass-mark number in api/src or engine code (P-319's guard pattern): grids are data.
  const ROOT = join(import.meta.dirname, "..");
  const SCORE = /\b(pass_?mark|points|max_?score|crs\w*|fsw\w*|clb)\s*[:=]\s*-?[1-9]\d*\b/i;
  const hits = (text: string) => text.split("\n").map((t, i) => [i + 1, t.replace(/\/\/.*$/, "")] as const).filter(([, t]) => SCORE.test(t)).map(([n]) => n);
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []; });
  const found = ["api/src", "engine"].flatMap((d) => walk(join(ROOT, d))).flatMap((p) => hits(readFileSync(p, "utf8")).map((n) => `${p.slice(ROOT.length + 1)}:${n}`));
  ok("AS-1g pass (guard): no score, pass-mark or CLB number is written in api/src or engine code", found.length === 0, found.slice(0, 5));
  ok("AS-1g fail (guard): the same check finds a pass mark written in code (a stand-in line)", hits("const rule = { passMark: 67 };").length === 1 && hits("// passMark: 67 in a comment").length === 0);

  sql(`delete from score_ruleset where key like 'as1g.%'`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
