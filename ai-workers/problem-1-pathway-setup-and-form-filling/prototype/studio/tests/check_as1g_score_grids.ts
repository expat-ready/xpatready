// AS-1g checks (R1.106; AG-3-5, AG-3-6, AG-3-7, AG-3-17, AG-3-18, AG-3-19; BR-1 to BR-3; P-577, P-588 (1), AGENTS rule 4):
// score grids as cited data on a release, end to end on the suites' fixture, each rule with a pass and a fail: a row with
// neither source_ref nor Sample is refused at import (and by the database); the app role cannot write the tables; a
// snapshot carries its grids and its hash changes with one point value; a case pinned to release 1 keeps release 1's
// grid after release 2 (P-496 (1)); two overlapping bands for one fact are refused at import; no score or pass-mark
// number appears in api/src or engine code (P-319's guard pattern). Every value here is Sample (test words), never an
// IRCC value: the cited Express Entry grids are AS-1c's. Rules only, no AI (US$0).
//   zsh studio/tools/isolated.sh runtime_as1g 4436 start && tsx studio/tests/check_as1g_score_grids.ts 4436 xr_studio_runtime_as1g
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  // 0. The migration, measured right after its own migration on a scratch database (rows rev 16.7, Amendment 6): never
  // assumed to be the newest.
  {
    const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), NEW = "20261124060000_as1g_score_grids", BIN = "/opt/homebrew/opt/postgresql@18/bin";
    const SCR = `xr_studio_as1g_mig_${process.pid}`, PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
    const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort(), before = all.filter((d) => d < NEW), after = all.filter((d) => d > NEW);
    const run = (d: string) => execFileSync(join(BIN, "psql"), [`postgresql://xr_studio@127.0.0.1:54329/${SCR}`, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "pipe", "pipe"] });
    const on = (q: string) => execFileSync(join(BIN, "psql"), [`postgresql://xr_studio@127.0.0.1:54329/${SCR}`, "-Atc", q], { encoding: "utf8" }).trim();
    execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", SCR], { stdio: "ignore" }); execFileSync(join(BIN, "createdb"), [...PG, SCR]);
    try {
      ok(`AS-1g pass (migration): its own stamp, later than every one before it (newest before: ${before.at(-1)})`, all.includes(NEW) && before.every((d) => d < NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1);
      for (const d of before) run(d);
      ok("AS-1g fail (migration): before it, no grid table exists", on(`select count(*) from pg_class where relname in ('score_ruleset','score_factor','score_band','language_conversion')`) === "0");
      run(NEW);
      ok("AS-1g pass (migration): right after it, the four tables with their cited-or-Sample checks; xr_app may select but not insert", on(`select count(*) from pg_constraint where conname in ('score_ruleset_cited','score_factor_cited','score_band_cited','language_conversion_cited')`) === "4"
        && on(`select string_agg(has_table_privilege('xr_app', t, 'SELECT')::text || has_table_privilege('xr_app', t, 'INSERT')::text, ',') from unnest(array['score_ruleset','score_factor','score_band','language_conversion']) t`) === "truefalse,truefalse,truefalse,truefalse");
      ok("AS-1g fail (migration): it does not apply twice", (() => { try { run(NEW); return false; } catch (e) { return /already exists/.test(String((e as { stderr?: Buffer }).stderr)); } })());
      for (const d of after) run(d);
      mkdirSync(join(STUDIO, "var"), { recursive: true });
      const cfg = join(STUDIO, "var", `as1g-${process.pid}.config.ts`);
      writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(join(STUDIO, "prisma", "schema"))}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: "postgresql://xr_studio@127.0.0.1:54329/${SCR}" } });\n`);
      const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", join(STUDIO, "prisma", "schema"), "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
      rmSync(cfg, { force: true });
      ok("AS-1g pass (migration): migrate diff from every migration to the schema is empty (indexes included)", r.status === 0, `${r.stdout}${r.stderr}`.slice(-400));
    } finally { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", SCR]); }
  }
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
  const mixed = grid(); mixed.factors[1].bands[0] = { when: { op: "in", field: "person.sample_clb", value: ["7", "8"] }, points: 4, source_ref: "Sample" };
  r = await propose(mixed);
  ok("AS-1g fail (overlap, breaker M3): words \"7\" beside a number range on one fact are refused (compared as text, both could match)", r.status === 400 && /mix number and string/.test(words(r)), words(r));
  const nowhere = grid(); nowhere.combinations = ["wp.famly"];
  r = await propose(nowhere);
  ok("AS-1g fail (combination, review M2): a grid naming a combination that does not exist is refused (400 GRID_COMBINATION)", r.status === 400 && r.body?.code === "GRID_COMBINATION" && /wp\.famly/.test(words(r)), words(r));
  const forged = [{ url: "javascript:alert(1)" }, { date: "2026-13-45" }, { quote: "\u200b" }, { section: " " }].map((x) => { const g = grid(); (g.factors[1] as any).source_ref = { ...(g.factors[1].source_ref as object), ...x }; return g; });
  const fr = await Promise.all(forged.map((g) => propose(g)));
  ok("AS-1g fail (forged source, breaker M5): a javascript: address, the date 2026-13-45, an invisible quote and a blank section are each refused", fr.every((x) => x.status === 400), fr.map((x) => x.status));
  ok("AS-1g fail (forged source, database): the table's check refuses the date 2026-02-31 and an http address", ["2026-02-31", "ok"].every((d, i) => /score_ruleset_cited/.test(fails("xr_studio", `insert into score_ruleset (id, key, label, selection_model, maximum, combination_keys, source_ref, sample, import_sha256, imported_by) values (gen_random_uuid(), 'as1g.f${i}', 'f', 'DRAW_RANKING', 10, '{}', '{"url": "${i ? "http" : "https"}://example.org/a", "section": "s", "quote": "q", "date": "${i ? "2026-01-02" : d}"}', false, 'x', 'x')`))));
  const huge = grid(); huge.maximum = 3_000_000_000;
  r = await propose(huge);
  ok("AS-1g fail (bounds, breaker M1): a maximum past the database's whole-number column is refused at import, not at approval", r.status === 400, [r.status, words(r)]);
  r = await propose(grid(), "user-R");
  ok("AS-1g fail (duty): a person without the author duty cannot propose (403)", r.status === 403 || r.status === 401, r.status);

  // A returned import never locks its key (review B1, breaker M1): withdrawn by its proposer, or replaced by the next import.
  r = await propose(grid(7));
  const back = await call("POST", `/library/changes/${r.body?.id}/return`, { note: "Test: wrong points (AS-1g)." }, "user-B");
  r = await propose(grid(8));
  ok("AS-1g pass (replace): after a return, a corrected import of the same key waits, and the returned one is marked replaced", back.status < 300 && r.status < 300 && sql(`select string_agg(status, ',' order by proposed_at) from library_change where kind='score_grid'`) === "WITHDRAWN,WAITING", [back.status, r.status, words(r)]);
  const again = await propose(grid(6));
  const wd = await call("POST", `/library/changes/${r.body?.id}/withdraw`, { note: "Test: withdrawn (AS-1g)." });
  ok("AS-1g fail (one at a time): a second import while one waits is refused (409); its proposer can withdraw the waiting one", again.status === 409 && wd.status < 300 && sql(`select count(*) from library_change where kind='score_grid' and status='WAITING'`) === "0", [again.status, wd.status, words(wd)]);

  // 4. Proposed (bands 18-36 and 36+ touch, never overlap), approved by a second person, written on the bypass use.
  r = await propose(grid());
  const id1 = r.body?.id;
  ok("AS-1g pass: the Sample grid (touching ranges, a cited factor) is proposed and waits; nothing written yet", r.status < 300 && sql(`select status from library_change where id='${id1}'`) === "WAITING" && sql(`select count(*) from score_ruleset where key='${KEY}'`) === "0", r.status >= 300 ? words(r) : r.body?.label);
  const queue = ((await call("GET", "/review-queue", undefined, "user-B")).body?.items ?? (await call("GET", "/review-queue", undefined, "user-B")).body ?? []) as any[];
  const item = (Array.isArray(queue) ? queue : []).find((x: any) => x.id === `change:${id1}`);
  ok("AS-1g pass (To review, review M6): the second person reads each band's points and source in words", /18 and person\.sample_age < 36 → 10 points \[Sample\]/.test(item?.what ?? "") && /example\.org\/test-page §Test section 1/.test(item?.what ?? "") && /4 rows cited|cited, \d+ Sample/.test(item?.what ?? ""), String(item?.what ?? Object.keys(queue)).slice(0, 300));
  const self = await approve(id1, "user-A");
  ok("AS-1g fail: the proposer cannot approve their own import", self.status >= 400 && sql(`select status from library_change where id='${id1}'`) === "WAITING", [self.status, words(self)]);
  r = await approve(id1);
  ok("AS-1g pass: a second person's approval writes the grid (2 factors, 4 bands, 2 language rows) and the change waits for the release", r.status < 300 && sql(`select (select count(*) from score_factor f join score_ruleset s on s.id = f.ruleset_id where s.key='${KEY}') || '|' || (select count(*) from score_band b join score_factor f on f.id = b.factor_id join score_ruleset s on s.id = f.ruleset_id where s.key='${KEY}') || '|' || (select count(*) from language_conversion c join score_ruleset s on s.id = c.ruleset_id where s.key='${KEY}')`) === "2|4|2" && sql(`select status from library_change where id='${id1}'`) === "APPROVED", [r.status, words(r)]);
  ok("AS-1g pass: each of the three imports that reached To review wrote one proposed line, and the approval one approved line", sql(`select string_agg(action || ':' || n, ',' order by action) from (select action, count(*) n from audit_event where entity='score grid' and entity_key='${KEY}' group by action) x`) === "approved:1,proposed:3");
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
  const line2 = ((await call("GET", `/combinations/${wp}`)).body?.draft?.changes ?? []).find((x: any) => x.kind === "Score grid");
  ok("AS-1g pass (review, breaker m5): the changed grid's release line shows the point value before and after", line2?.change === "changed" && /now age .*→ 9 points/.test(line2?.label ?? "") && /was age .*→ 10 points/.test(line2?.label ?? ""), line2?.label);
  r = await release(wp);
  const [rel2] = latest(wp);
  ok("AS-1g pass (release 2): release 2 carries 9 points", r.status < 300 && rel2 !== rel1 && pointsIn(rel2) === "9", [r.status, words(r)]);
  ok("AS-1g pass (P-496 (1)): the case is still pinned to release 1, whose grid still gives 10 points", sql(`select config_release_id from pack_work_pin where case_id='${caseId}' order by revision desc limit 1`) === rel1 && pointsIn(rel1) === "10");

  // 7. No score or pass-mark number in api/src or engine code (P-319's guard pattern): grids are data.
  const ROOT = join(import.meta.dirname, "..");
  // A score-shaped name compared with, or set to, a number of 2 or more (0 and 1 are counts and flags, not scores).
  const SCORE = /\b\w*(pass_?mark|points|score|clb|crs|fsw|threshold|cut_?off)\w*\s*(:|=|===?|!==?|>=?|<=?)\s*-?([2-9]|\d{2,})/i;
  const hits = (text: string) => text.split("\n").map((t, i) => [i + 1, t.replace(/\/\/.*$/, "")] as const).filter(([, t]) => SCORE.test(t)).map(([n]) => n);
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []; });
  const found = ["api/src", "engine"].flatMap((d) => walk(join(ROOT, d))).flatMap((p) => hits(readFileSync(p, "utf8")).map((n) => `${p.slice(ROOT.length + 1)}:${n}`));
  ok("AS-1g pass (guard): no score, pass-mark or CLB number is written in api/src or engine code", found.length === 0, found.slice(0, 5));
  const stand = ["const rule = { passMark: 67 };", "if (points >= 67) ok();", "if (clb >= 7) x();", "const f = { maxPoints: 12 };", "let agePoints = 12;", "const s = { score: 470 };", "const t = { threshold: 67 };"];
  ok("AS-1g fail (guard, review M5): the same check finds each stand-in score in code; a comment is not code", stand.every((t) => hits(t).length === 1) && hits("// passMark: 67 in a comment").length === 0, stand.filter((t) => !hits(t).length));

  sql(`delete from score_ruleset where key like 'as1g.%'`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
