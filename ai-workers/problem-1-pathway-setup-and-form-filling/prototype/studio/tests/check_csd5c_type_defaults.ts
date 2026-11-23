// CS-D7c checks (R1.70 part 1, runtime lane; map row 70; AG-9-12, AG-9-64; AGENTS rule 4, P-170): a document type's
// translation, notarisation and validity defaults, end to end through a release on the suites' fixture. Each rule has a
// pass and a fail: a value with its official citation is proposed, approved by a second person and published with the next
// release; one without a citation is refused (the API at proposal, the database at publish); a published type's values
// never change in place (a new draft version); old types read null and their release is written as before. The quote and
// source here are test words (labelled Test), not immigration values. Rules only, no AI (US$0).
//   zsh studio/tools/isolated.sh runtime_csd5c 4434 start && tsx studio/tests/check_csd5c_type_defaults.ts 4434 xr_studio_runtime_csd5c
import { execFileSync } from "node:child_process";
import { sourceEveryNumber } from "./fixtures/source-every-number.cjs";

const PORT = Number(process.argv[2] ?? 4434), DB = process.argv[3] ?? "xr_studio_runtime_csd5c";
let pass = 0, fail = 0;
const ok = (name: string, c: boolean, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 260)}` : ""}`); };
const call = async (method: string, path: string, body?: unknown, actor = "user-A") => {
  const r = await fetch(`http://localhost:${PORT}/api${path}`, { method, headers: { "x-actor": actor, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const PSQL = "/opt/homebrew/opt/postgresql@18/bin/psql";
const sql = (q: string) => execFileSync(PSQL, [`postgresql://xr_studio@127.0.0.1:54329/${DB}`, "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sqlFails = (q: string) => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };
const words = (r: { body: any }) => String(r.body?.detail ?? r.body?.message ?? "");
const PASSPORT = "passport_or_travel_document_information_page_photocopy";
const CITED = { source_quote: "Test words (fixture): documents not in English or French need a translation and an affidavit.", source_file: "Test source (fixture), page 1" };
const VALUES = { translation_rule: "REQUIRED_IF_NOT_EN_FR", notarisation_rule: "NOT_REQUIRED", has_expiry: true, max_age_days: 180 };

(async () => {
  const served = (await call("GET", "/session")).body?.workspace?.id;
  const inDb = (() => { try { return sql(`select id from workspace where id='${served}'`); } catch { return ""; } })();
  if (!served || !inDb) { console.error(`STOP  the database ${DB} is not the one the server on port ${PORT} uses. Pass the copy's database: tsx <check> ${PORT} xr_studio_<name>.`); process.exit(2); }
  await call("POST", "/demo/reset", { confirm: "RESET" });
  const l = await call("POST", "/demo/load", {});
  if (l.status >= 300) { console.error("STOP  the sample did not load", l.body); process.exit(2); }
  const wp = sql(`select id from combination where combination_key='wp.family'`);
  if (!wp || sql(`select count(*) from document_type where document_type_key='${PASSPORT}' and status='PUBLISHED'`) !== "1") { console.error("STOP  the fixture has no wp.family or no published passport type"); process.exit(2); }

  // Old types read null and behave as today (measured right after the migration, never assuming it is the newest).
  ok("CS-D7c pass (migration): every existing document type reads null for the four defaults and their citation", sql(`select count(*) from document_type where translation_rule is not null or notarisation_rule is not null or has_expiry is not null or max_age_days is not null or defaults_source_quote is not null or defaults_source_file is not null`) === "0");
  const rel1 = (await call("GET", `/combinations/${wp}/config?mode=published`)).body?.snapshot;
  ok("CS-D7c pass (old types): the published release writes no defaults key on any type (byte-identical to before)", Array.isArray(rel1?.document_types) && rel1.document_types.length > 0 && rel1.document_types.every((t: any) => !("defaults" in t)), rel1?.document_types?.length);
  let v = await call("GET", `/library/document-types/${PASSPORT}/defaults`);
  ok("CS-D7c pass: the type's defaults read \"not set\" with nulls", v.status === 200 && v.body?.defaults?.translation_rule === null && /not set/.test(v.body?.words ?? ""), v.body?.words);

  // A value without its citation is refused at proposal.
  const route = `/library/document-types/${PASSPORT}/defaults`;
  let r = await call("POST", route, { ...VALUES, reason: "Test: set the translation rule (CS-D7c)." });
  ok("CS-D7c fail: a value with no citation is refused (400 DEFAULTS_UNCITED) and nothing is proposed", r.status === 400 && r.body?.code === "DEFAULTS_UNCITED" && sql(`select count(*) from library_change where kind='document_defaults'`) === "0", [r.status, words(r)]);
  r = await call("POST", route, { ...VALUES, source_quote: "  ", source_file: CITED.source_file, reason: "Test: blank quote (CS-D7c)." });
  ok("CS-D7c fail: a blank quote is no citation (400)", r.status === 400, [r.status, words(r)]);
  r = await call("POST", route, { ...VALUES, translation_rule: "SOMETIMES", ...CITED, reason: "Test: unknown rule (CS-D7c)." });
  ok("CS-D7c fail: a translation rule outside the two values is refused (400)", r.status === 400 && /translation_rule/.test(words(r)), words(r));
  r = await call("POST", route, { ...VALUES, ...CITED, reason: "Test: as reader (CS-D7c)." }, "user-R");
  ok("CS-D7c fail: a person without the author duty cannot propose (403)", r.status === 403 || r.status === 401, r.status);

  // With a citation: waits, the proposer cannot approve, a second person can.
  const pubBefore = sql(`select id || '|' || version from document_type where document_type_key='${PASSPORT}' and status='PUBLISHED'`);
  r = await call("POST", route, { ...VALUES, ...CITED, reason: "Test: set the passport's defaults (CS-D7c)." });
  const id = r.body?.id;
  ok("CS-D7c pass: a cited REQUIRED_IF_NOT_EN_FR proposal waits for a second person", r.status < 300 && sql(`select status from library_change where id='${id}'`) === "WAITING", r.status >= 300 ? words(r) : r.body?.label);
  const again = await call("POST", route, { ...VALUES, max_age_days: 90, ...CITED, reason: "Test: a second proposal (CS-D7c)." });
  ok("CS-D7c fail: a second proposal while one waits is refused (409)", again.status === 409, words(again));
  const seen = (await call("GET", `/library/changes/${id}`, undefined, "user-B")).body;
  ok("CS-D7c pass: the second person reads before → after in words and the official words", /not set/.test(seen?.defaults?.before ?? "") && /required when not in English or French/.test(seen?.defaults?.after ?? "") && seen?.defaults?.quote === CITED.source_quote, seen?.defaults);
  const self = await call("POST", `/library/changes/${id}/approve`, { note: "Self (CS-D7c)." }, "user-A");
  ok("CS-D7c fail: the proposer cannot approve their own change", self.status >= 400 && sql(`select status from library_change where id='${id}'`) === "WAITING", [self.status, words(self)]);
  r = await call("POST", `/library/changes/${id}/approve`, { note: "Second person (CS-D7c check)." }, "user-B");
  const draft = sql(`select translation_rule || '|' || notarisation_rule || '|' || has_expiry || '|' || max_age_days || '|' || (defaults_source_quote is not null) || '|' || status from document_type where document_type_key='${PASSPORT}' order by version desc limit 1`);
  ok("CS-D7c pass: at approval a new draft version carries the values and the citation; the change is approved, not released", r.status < 300 && draft === "REQUIRED_IF_NOT_EN_FR|NOT_REQUIRED|true|180|true|DRAFT" && sql(`select status from library_change where id='${id}'`) === "APPROVED", { status: r.status, words: words(r), draft });
  ok("CS-D7c pass (never in place): the published version is untouched (same id and version, values still null)", sql(`select id || '|' || version from document_type where document_type_key='${PASSPORT}' and status='PUBLISHED'`) === pubBefore && sql(`select coalesce(translation_rule,'null') from document_type where document_type_key='${PASSPORT}' and status='PUBLISHED'`) === "null");
  ok("CS-D7c pass: the proposal and the approval each wrote one audit line on the type", sql(`select count(*) from audit_event where entity='document type' and entity_key='${PASSPORT}' and action in ('proposed','approved')`) === "2");
  const lines = ((await call("GET", `/combinations/${wp}`)).body?.draft?.changes ?? []).filter((x: any) => x.kind === "Document type" && x.key === PASSPORT);
  ok("CS-D7c pass: the release line the expert signs names the defaults in words and needs sign-off", lines.length === 1 && lines[0].needs_sme && /defaults: translation required when not in English or French/.test(lines[0].label), lines.map((x: any) => x.label));

  // The next release publishes the type with its values.
  await sourceEveryNumber(PORT, wp);
  await call("POST", `/combinations/${wp}/submit`, {});
  const review = (await call("GET", `/combinations/${wp}/review`)).body;
  const sme = ((review.submission?.changeSummary ?? []) as any[]).filter((x) => x.needs_sme).map((x) => `${x.kind}|${x.key}`);
  if (sme.length) await call("POST", `/combinations/${wp}/signoff`, { items: sme, action: "signed" }, "user-C");
  r = await call("POST", `/combinations/${wp}/approve`, {}, "user-B");
  ok("CS-D7c pass: the next release goes out", r.status === 201 && r.body?.version === 2, words(r) || r.body?.version);
  const pub = sql(`select translation_rule || '|' || max_age_days || '|' || version from document_type where document_type_key='${PASSPORT}' and status='PUBLISHED'`);
  ok("CS-D7c pass: the type is published as a new version with the values, and the change is released", pub.startsWith("REQUIRED_IF_NOT_EN_FR|180|") && Number(pub.split("|")[2]) === Number(pubBefore.split("|")[1]) + 1 && sql(`select status from library_change where id='${id}'`) === "RELEASED", { pub, change: sql(`select status from library_change where id='${id}'`) });
  const rel2 = (await call("GET", `/combinations/${wp}/config?mode=published`)).body?.snapshot;
  const t = (rel2?.document_types ?? []).find((x: any) => x.key === PASSPORT);
  ok("CS-D7c pass: the released snapshot carries the defaults with their citation; other types still carry none", t?.defaults?.translation_rule === "REQUIRED_IF_NOT_EN_FR" && t?.defaults?.max_age_days === 180 && t?.defaults?.source_quote === CITED.source_quote && rel2.document_types.filter((x: any) => x.key !== PASSPORT).every((x: any) => !("defaults" in x)), t?.defaults);

  // The database refuses a published version with a value and no citation, whatever path tries.
  const other = sql(`select id from document_type where status='PUBLISHED' and document_type_key <> '${PASSPORT}' order by document_type_key limit 1`);
  let e = sqlFails(`update document_type set translation_rule='REQUIRED_IF_NOT_EN_FR' where id='${other}'`);
  ok("CS-D7c fail (at publish): a published version given a value without a citation is refused by the database", /document_type_defaults_cited_check/.test(e), e.slice(0, 160));
  const ws = sql(`select workspace_id from document_type where id='${other}'`);
  sql(`insert into document_type (id, workspace_id, document_type_key, name, category, version, status, origin, updated_by, translation_rule) values (gen_random_uuid(), '${ws}', 'csd5c_test_type', 'Test type (CS-D7c)', 'client', 1, 'DRAFT', 'HUMAN', 'test', 'REQUIRED_IF_NOT_EN_FR')`);
  e = sqlFails(`update document_type set status='PUBLISHED' where document_type_key='csd5c_test_type'`);
  ok("CS-D7c fail (at publish): an uncited draft cannot be published (the database refuses the status change)", /document_type_defaults_cited_check/.test(e) && sql(`select status from document_type where document_type_key='csd5c_test_type'`) === "DRAFT", e.slice(0, 160));
  e = sqlFails(`update document_type set defaults_source_quote='Test words', defaults_source_file='Test source', status='PUBLISHED' where document_type_key='csd5c_test_type'`);
  ok("CS-D7c pass (at publish): the same draft with its citation publishes", e === "" && sql(`select status from document_type where document_type_key='csd5c_test_type'`) === "PUBLISHED", e.slice(0, 160));
  sql(`delete from document_type where document_type_key='csd5c_test_type'`);

  // Clearing needs no citation; the same values twice change nothing.
  r = await call("POST", route, { ...VALUES, ...CITED, reason: "Test: the same again (CS-D7c)." });
  ok("CS-D7c fail: proposing exactly the published defaults again is refused (409 Nothing changes)", r.status === 409 && /already has exactly these defaults/.test(words(r)), words(r));
  r = await call("POST", route, { translation_rule: null, notarisation_rule: null, has_expiry: null, max_age_days: null, reason: "Test: clear the defaults (CS-D7c)." });
  ok("CS-D7c pass: clearing every value needs no citation and waits for a second person", r.status < 300 && r.body?.change?.after === "not set (behaves as before)", [r.status, words(r)]);
  if (r.body?.id) {
    const w = await call("POST", `/library/changes/${r.body.id}/withdraw`, { note: "Test only (CS-D7c)." });
    ok("CS-D7c pass: a waiting change of defaults is withdrawn by its proposer", w.status < 300 && sql(`select status from library_change where id='${r.body.id}'`) === "WITHDRAWN", [w.status, words(w)]);
  }
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FAIL  unexpected", e); process.exit(1); });
