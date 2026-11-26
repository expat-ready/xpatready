// CS-W2 part filings (Release 1 row R1.3; BACKLOG CS-W2; brief design/briefs/CS-W2.md part 1; contract v0.1 §8 steps 2,
// 2a, conditions 1 and 3; P-575, P-588 (4)): the platform firm on the nine filings tables. Each named case has a pass and a fail.
//   1. a scratch database: every migration before 20261126090000_filings__csw2_firm_id, two Sample firms, a case of each
//      and one of a key with no platform firm, each with rows in all nine tables (one case's stage ended, its assessment
//      frozen); then the migration and every later one. DW1.1 (backfill), DW1.2 (fill), DW1.3 (each composite key),
//      DW1.4 (names, INVOKER, the follow past the write-once and stage guards). A second scratch database: a filing under
//      another firm's group stops the migration with words (DW1.1 fail).
//   2. the isolated copy this suite runs on: W1, a case opened and prepared through the API; every filings row it made
//      carries the case's firm.
// Releases Visitor visa on the copy when missing (tests/runtime/setup_visitor_visa.ts, then acceptance/lib/setup_vv_m3.ts).
// `migrate diff` empty is check_prisma_schema.ts's (M). No model call (US$0).
//   zsh studio/tools/isolated.sh rt_csw2f 4497 start && tsx studio/tests/check_csw2_filings.ts 4497 xr_studio_rt_csw2f
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { needVisitorVisa, openCase, prepare, sql as copySql } from "../acceptance/lib/m3.ts";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), NEW = "20261126090000_filings__csw2_firm_id";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", HOST = "127.0.0.1:54329", pg = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TABLES = ["submission_group", "filing", "filing_applicant", "filing_item", "assessment", "assessment_override", "assessment_review", "filing_change", "filing_form_addition"];
const [W, CMB, F1, F2, F3, PARTY, REL] = [u(1), u(2), u(3), u(4), u(5), u(6), u(7)];

function scratch(name: string) {
  const DB = `xr_studio_csw2f_${name}_${process.pid}`, url = (user = "xr_studio") => `postgresql://${user}@${HOST}/${DB}`;
  const psql = (args: string[], user?: string) => execFileSync(join(BIN, "psql"), [url(user), "-X", "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q: string, user?: string) => psql(["-Atc", q], user);
  const err = (q: string, user?: string) => { try { sql(q, user); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };
  const file = (f: string) => psql(["-f", f]);
  execFileSync(join(BIN, "dropdb"), [...pg, "--if-exists", "--force", DB]);
  execFileSync(join(BIN, "createdb"), [...pg, DB]);
  const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
  for (const d of all.filter((x) => x < NEW)) file(join(MIG, d, "migration.sql"));
  const drop = () => execFileSync(join(BIN, "dropdb"), [...pg, "--if-exists", "--force", DB]);
  return { sql, err, file, drop, rest: () => { for (const d of all.filter((x) => x > NEW)) file(join(MIG, d, "migration.sql")); } };
}

// One case's rows in all nine tables: n is 1, 2 or 3 (sample-firm, sample-solo, a key with no platform firm).
const caseRows = (n: number, key: string, firm: string | null, stageState = "CURRENT") => {
  const [K, ST, APP, PRI, G, FL, AS] = [u(10 + n), u(20 + n), u(500 + n * 10), u(501 + n * 10), u(30 + n), u(40 + n), u(60 + n)];
  return `
    insert into runtime_case (id, workspace_id, combination_id, reference, client_actor_id, created_by, firm_key, case_number, firm_id) values ('${K}', '${W}', '${CMB}', 'W2-${n}', 'user-P', 'user-O', '${key}', 'C-2026-0000${n}', ${firm ? `'${firm}'` : "null"});
    insert into answer_subject (id, workspace_id, party_id, subject_kind, label) values ('${APP}', '${W}', '${PARTY}', 'case', 'The application'), ('${PRI}', '${W}', '${PARTY}', 'principal', 'Client ${n}');
    insert into case_stage (id, workspace_id, case_id, firm_key, ord, stage_key, staff_name, client_name, combination_id, state, application_subject_id, started_from, firm_id) values ('${ST}', '${W}', '${K}', '${key}', 1, 'vv', 'V', 'V', '${CMB}', '${stageState}', '${APP}', 'BEGIN', ${firm ? `'${firm}'` : "null"});
    insert into submission_group (id, workspace_id, case_id, kind, stage_id) values ('${G}', '${W}', '${K}', 'FAMILY', '${ST}');
    insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id) values ('${FL}', '${W}', '${K}', '${G}', '${PRI}', 'vv.single', 'files_own', '${ST}');
    insert into filing_applicant (id, filing_id, subject_id, role, mode) values ('${u(70 + n)}', '${FL}', '${PRI}', 'principal', 'applying');
    insert into filing_item (id, workspace_id, case_id, filing_id, kind, item_key, subject_id) values ('${u(80 + n)}', '${W}', '${K}', '${FL}', 'form', 'IMM 5257', '${PRI}');
    insert into assessment (id, workspace_id, case_id, subject_id, config_release_id, result_json, run_type, created_by) values ('${AS}', '${W}', '${K}', '${PRI}', '${REL}', '{}', 'MANUAL', 'user-O');
    insert into assessment_override (id, assessment_id, program_key, from_outcome, label, reason, stamp, created_by) values ('${u(90 + n)}', '${AS}', 'vv', 'NOT_ELIGIBLE', 'Sample', 'Sample reason', '{}', 'user-O');
    insert into assessment_review (assessment_id, reviewed_by, stamp) values ('${AS}', 'user-O', '{}');
    insert into filing_change (id, workspace_id, case_id, kind, subject_id, roles_before, roles_after, changed_by) values ('${u(100 + n)}', '${W}', '${K}', 'travelling_flag', '${PRI}', '[]', '[]', 'user-O');
    insert into filing_form_addition (id, workspace_id, case_id, filing_id, subject_id, form_key, edition_id, edition_label, kind, frozen, frozen_sha256, channel, signature, added_by) values ('${u(110 + n)}', '${W}', '${K}', '${FL}', '${PRI}', 'IMM 5409', '${u(9)}', '2024-01', 'blank', '{}', '${"0".repeat(64)}', 'PAPER', 'HAND_SCANNED', 'user-O');`;
};
const seedBase = `set session_replication_role = replica;
  insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${F1}', 'sample-firm', 'Sample Firm', 'CA', 'a@sample-firm.example.com', now()), ('${F2}', 'sample-solo', 'Sample Solo', 'CA', 'a@sample-solo.example.com', now());
  insert into combination (id, workspace_id, program_def_id, combination_key, label, participants, created_by) values ('${CMB}', '${W}', '${W}', 'vv.single', 'Visitor visa', '[]', 't');
  insert into party (id, workspace_id) values ('${PARTY}', '${W}');`;

// ------------------------------------------------------------------------------------------ 1. the scratch database
const A = scratch("mig");
try {
  // Case 5 (sample-firm) has an ended stage: its rows are kept as they were, yet the fill must reach them.
  A.sql(seedBase + caseRows(1, "sample-firm", F1) + caseRows(2, "sample-solo", F2) + caseRows(3, "ghost-firm", null) + caseRows(5, "sample-firm", F1, "ENDED_NEXT_STARTED"));
  const procs = () => A.sql(`select string_agg(p.proname, ',' order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`).split(",");
  const before = new Set(procs());
  A.file(join(MIG, NEW, "migration.sql"));
  const added = procs().filter((p) => !before.has(p));
  A.rest();

  // ---------------------------------------------------------------- DW1.1: the backfill
  const firmsOf = (t: string) => A.sql(`select count(*) filter (where firm_id = '${F1}') || '/' || count(*) filter (where firm_id = '${F2}') || '/' || count(*) filter (where firm_id is null) from ${t}`);
  const all = TABLES.map((t) => `${t}=${firmsOf(t)}`);
  ok("CS-W2 DW1.1 pass: after the migration every row of the nine tables carries its case's firm (two sample-firm rows, one of them under an ended stage, and one sample-solo row per table), the ended stage's and the frozen run's included",
    all.every((x) => x.endsWith("=2/1/1")), all);
  const wrong = A.sql(TABLES.filter((t) => !["filing_applicant", "assessment_override", "assessment_review"].includes(t)).map((t) => `select count(*) from ${t} c join runtime_case k on k.id = c.case_id where c.firm_id is distinct from k.firm_id`).join(" union all ")).split("\n").map(Number);
  ok("CS-W2 DW1.1 pass: each case-keyed row's firm equals its case's", wrong.every((n) => n === 0), wrong);
  ok("CS-W2 DW1.1 fail: a case whose key has no platform firm leaves its rows empty, never another firm's (one null per table)", all.every((x) => /\/1$/.test(x)));

  // ---------------------------------------------------------------- DW1.2: the fill on insert
  const [K1, K2, ST2, PRI1, PRI2, FL2, AS1, AS2, G2] = [u(11), u(12), u(22), u(511), u(521), u(42), u(61), u(62), u(32)];
  const ST1 = u(21);
  const ins: Record<string, (id: string, extra?: string) => string> = {
    submission_group: (id) => `insert into submission_group (id, workspace_id, case_id, kind, reason, stage_id) values ('${id}', '${W}', '${K1}', 'SEPARATE', 'Sample', '${ST1}') returning firm_id`,
    filing: (id) => `insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id) values ('${id}', '${W}', '${K1}', '${u(200)}', '${u(541)}', 'vv.single', 'files_own', '${ST1}') returning firm_id`,
    filing_applicant: (id) => `insert into filing_applicant (id, filing_id, subject_id, role, mode) values ('${id}', '${u(201)}', '${u(542)}', 'spouse', 'applying') returning firm_id`,
    filing_item: (id) => `insert into filing_item (id, workspace_id, case_id, filing_id, kind, item_key, subject_id) values ('${id}', '${W}', '${K1}', '${u(201)}', 'form', 'IMM 5645', '${PRI1}') returning firm_id`,
    assessment: (id) => `insert into assessment (id, workspace_id, case_id, subject_id, config_release_id, result_json, run_type, created_by) values ('${id}', '${W}', '${K1}', '${PRI1}', '${REL}', '{}', 'RERUN', 'user-O') returning firm_id`,
    assessment_override: (id) => `insert into assessment_override (id, assessment_id, program_key, from_outcome, label, reason, stamp, created_by) values ('${id}', '${AS1}', 'vv', 'X', 'Sample', 'Sample', '{}', 'user-O') returning firm_id`,
    assessment_review: () => `insert into assessment_review (assessment_id, reviewed_by, stamp) values ('${u(202)}', 'user-O', '{}') returning firm_id`,
    filing_change: (id) => `insert into filing_change (id, workspace_id, case_id, kind, subject_id, roles_before, roles_after, changed_by) values ('${id}', '${W}', '${K1}', 'travelling_flag', '${PRI1}', '[]', '[]', 'user-O') returning firm_id`,
    filing_form_addition: (id) => `insert into filing_form_addition (id, workspace_id, case_id, filing_id, subject_id, form_key, edition_id, edition_label, kind, frozen, frozen_sha256, channel, signature, added_by) values ('${id}', '${W}', '${K1}', '${u(201)}', '${PRI1}', 'IMM 5476', '${u(9)}', '2024-01', 'blank', '{}', '${"0".repeat(64)}', 'PAPER', 'HAND_SCANNED', 'user-O') returning firm_id`,
  };
  // Parents for the fill cases, all of case 1 (sample-firm) on its current stage.
  A.sql(`insert into answer_subject (id, workspace_id, party_id, subject_kind, label) values ('${u(541)}', '${W}', '${PARTY}', 'principal', 'P'), ('${u(542)}', '${W}', '${PARTY}', 'spouse_or_partner', 'S'), ('${u(543)}', '${W}', '${PARTY}', 'child', 'C');
    insert into submission_group (id, workspace_id, case_id, kind, reason, stage_id) values ('${u(200)}', '${W}', '${K1}', 'SEPARATE', 'Sample', '${ST1}');
    insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id) values ('${u(201)}', '${W}', '${K1}', '${u(200)}', '${u(543)}', 'vv.single', 'files_own', '${ST1}');
    insert into assessment (id, workspace_id, case_id, subject_id, config_release_id, result_json, run_type, created_by) values ('${u(202)}', '${W}', '${K1}', '${PRI1}', '${REL}', '{}', 'MANUAL', 'user-O')`);
  const filled = TABLES.map((t, i) => { const r = A.err(ins[t](u(300 + i))); return r ? `${t}: ${r.slice(0, 120)}` : `${t}=${A.sql(`select firm_id from ${t} where ${t === "assessment_review" ? "assessment_id" : "id"} = '${t === "assessment_review" ? u(202) : u(300 + i)}'`)}`; });
  ok("CS-W2 DW1.2 pass: an insert with no firm gets its parent's firm, in each of the nine tables (the parent: the case, the filing or the assessment)",
    filled.every((x) => x.endsWith(`=${F1}`)), filled);
  const named = (t: string, f: string) => A.err(`begin; ${ins[t](u(400)).replace(/ returning firm_id$/, "").replace(/\) values \(/, ", firm_id) values (").replace(/\)$/, `, '${f}')`)}; rollback;`);
  const otherFirm = ["filing", "filing_applicant", "assessment_override", "filing_change"].map((t) => [t, named(t, F2)] as const);
  ok("CS-W2 DW1.2 fail: an insert naming the other Sample firm is refused, through each kind of parent (case, filing, assessment)",
    otherFirm.every(([, e]) => /case_firm_fill: a \w+ row's firm must be its \w+ row's firm/.test(e)), otherFirm);
  const setB = (t: string) => A.err(`begin; set local app.firm_id = '${F2}'; ${ins[t](u(401))}; rollback;`);
  const asB = ["submission_group", "filing_applicant", "assessment_override"].map((t) => [t, setB(t)] as const);
  ok("CS-W2 DW1.2 fail: with app.firm_id set to firm B, an insert under a firm A parent is refused",
    asB.every(([, e]) => /case_firm_fill/.test(e)), asB);
  ok("CS-W2 DW1.2 pass: with app.firm_id set to the parent's firm the insert goes through with that firm",
    A.sql(`begin; set local app.firm_id = '${F1}'; ${ins.filing_change(u(402))}; rollback;`).includes(F1));

  // ---------------------------------------------------------------- DW1.3: each composite key, the fill set aside
  // The fill trigger is the first wall; with it disabled (inside a rolled-back transaction) each key must still refuse a
  // row naming firm A with a parent of firm B.
  const keyCase = (t: string, fk: string, q: string) => {
    const e = A.err(`begin; alter table ${t} disable trigger case_filings_firm_fill; ${q}; rollback;`);
    return [fk, new RegExp(`violates foreign key constraint "${fk}"`).test(e) ? "refused" : e.slice(0, 160)] as const;
  };
  const keys = [
    keyCase("submission_group", "submission_group_case_id_firm_id_fkey", `insert into submission_group (id, workspace_id, case_id, kind, reason, stage_id, firm_id) values ('${u(410)}', '${W}', '${K2}', 'SEPARATE', 'x', '${ST2}', '${F1}')`),
    keyCase("filing", "filing_case_id_firm_id_fkey", `insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id, firm_id) values ('${u(411)}', '${W}', '${K2}', '${G2}', '${u(542)}', 'vv.single', 'files_own', '${ST2}', '${F1}')`),
    keyCase("filing", "filing_submission_group_id_firm_id_fkey", `insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id, firm_id) values ('${u(412)}', '${W}', '${K1}', '${G2}', '${u(542)}', 'vv.single', 'files_own', '${ST1}', '${F1}')`),
    keyCase("filing_applicant", "filing_applicant_filing_id_firm_id_fkey", `insert into filing_applicant (id, filing_id, subject_id, role, mode, firm_id) values ('${u(413)}', '${FL2}', '${u(542)}', 'spouse', 'applying', '${F1}')`),
    keyCase("filing_item", "filing_item_case_id_firm_id_fkey", `insert into filing_item (id, workspace_id, case_id, filing_id, kind, item_key, subject_id, firm_id) values ('${u(414)}', '${W}', '${K2}', '${u(201)}', 'form', 'X', '${PRI1}', '${F1}')`),
    keyCase("filing_item", "filing_item_filing_id_firm_id_fkey", `insert into filing_item (id, workspace_id, case_id, filing_id, kind, item_key, subject_id, firm_id) values ('${u(415)}', '${W}', '${K1}', '${FL2}', 'form', 'X', '${PRI1}', '${F1}')`),
    keyCase("assessment", "assessment_case_id_firm_id_fkey", `insert into assessment (id, workspace_id, case_id, subject_id, config_release_id, result_json, run_type, created_by, firm_id) values ('${u(416)}', '${W}', '${K2}', '${PRI2}', '${REL}', '{}', 'RERUN', 'x', '${F1}')`),
    keyCase("assessment_override", "assessment_override_assessment_id_firm_id_fkey", `insert into assessment_override (id, assessment_id, program_key, from_outcome, label, reason, stamp, created_by, firm_id) values ('${u(417)}', '${AS2}', 'vv', 'X', 'S', 'S', '{}', 'x', '${F1}')`),
    keyCase("assessment_review", "assessment_review_assessment_id_firm_id_fkey", `delete from assessment_review where assessment_id = '${AS2}'; insert into assessment_review (assessment_id, reviewed_by, stamp, firm_id) values ('${AS2}', 'x', '{}', '${F1}')`),
    keyCase("filing_change", "filing_change_case_id_firm_id_fkey", `insert into filing_change (id, workspace_id, case_id, kind, subject_id, roles_before, roles_after, changed_by, firm_id) values ('${u(418)}', '${W}', '${K2}', 'travelling_flag', '${PRI2}', '[]', '[]', 'x', '${F1}')`),
    keyCase("filing_form_addition", "filing_form_addition_case_id_firm_id_fkey", `insert into filing_form_addition (id, workspace_id, case_id, filing_id, subject_id, form_key, edition_id, edition_label, kind, frozen, frozen_sha256, channel, signature, added_by, firm_id) values ('${u(419)}', '${W}', '${K2}', '${u(201)}', '${PRI1}', 'X', '${u(9)}', 'e', 'blank', '{}', '${"0".repeat(64)}', 'PAPER', 'HAND_SCANNED', 'x', '${F1}')`),
    keyCase("filing_form_addition", "filing_form_addition_filing_id_firm_id_fkey", `insert into filing_form_addition (id, workspace_id, case_id, filing_id, subject_id, form_key, edition_id, edition_label, kind, frozen, frozen_sha256, channel, signature, added_by, firm_id) values ('${u(420)}', '${W}', '${K1}', '${FL2}', '${PRI1}', 'X', '${u(9)}', 'e', 'blank', '{}', '${"0".repeat(64)}', 'PAPER', 'HAND_SCANNED', 'x', '${F1}')`),
  ];
  ok("CS-W2 DW1.3 fail: through each of the twelve composite keys, a firm A row cannot name a firm B parent (fill trigger set aside)", keys.length === 12 && keys.every(([, r]) => r === "refused"), keys.filter(([, r]) => r !== "refused"));
  ok("CS-W2 DW1.3 pass: the same keys accept a parent of the row's own firm (a firm B item under firm B's filing)",
    A.err(`begin; alter table filing_item disable trigger case_filings_firm_fill; insert into filing_item (id, workspace_id, case_id, filing_id, kind, item_key, subject_id, firm_id) values ('${u(421)}', '${W}', '${K2}', '${FL2}', 'form', 'X', '${PRI2}', '${F2}'); rollback;`) === "");
  const moveItem = A.err(`update filing_item set filing_id = '${FL2}' where id = '${u(81)}'`);
  ok("CS-W2 DW1.3 fail: moving a firm A item under firm B's filing is refused by its key (an update, not only an insert)", /violates foreign key constraint "filing_item_filing_id_firm_id_fkey"/.test(moveItem), moveItem.slice(0, 200));
  // Breaker M1: emptying firm_id would skip the keys (MATCH SIMPLE); the keep refuses it, and a change to another firm.
  const emptied = [
    A.err(`update filing_applicant set firm_id = null, filing_id = '${FL2}' where id = '${u(71)}'`),
    A.err(`update assessment_override set firm_id = null, assessment_id = '${AS2}' where id = '${u(91)}'`),
    A.err(`update assessment_review set firm_id = null where assessment_id = '${AS1}'`),
    A.err(`update filing_item set firm_id = null, filing_id = '${FL2}' where id = '${u(81)}'`),
    A.err(`update submission_group set firm_id = null where id = '${u(200)}'`),
    A.err(`update filing set firm_id = '${F2}' where id = '${u(201)}'`),
  ];
  ok("CS-W2 DW1.3 fail (breaker M1): a firm once set cannot be emptied (which would skip the keys and let a row move under firm B) nor changed, as the table owner and as xr_app",
    emptied.every((e) => /case_filings_firm_keep: a \w+ row keeps its firm/.test(e))
    && /case_filings_firm_keep/.test(A.err(`update filing_applicant set firm_id = null, filing_id = '${FL2}' where id = '${u(71)}'`, "xr_app")), emptied.map((e) => e.slice(0, 100)));
  const moveFirm = A.err(`update runtime_case set firm_id = '${F2}' where id = '${K1}'`);
  ok("CS-W2 DW1.3 fail: a case's firm cannot move while its filings name it (ON UPDATE RESTRICT on a composite key)", /violates RESTRICT setting of foreign key constraint "(submission_group|filing|filing_item|assessment|filing_change|filing_form_addition)_case_id_firm_id_fkey"/.test(moveFirm), moveFirm.slice(0, 200));

  // ---------------------------------------------------------------- DW1.4: names, rights, and the follow
  const ours = added.sort().join(",");
  ok("CS-W2 DW1.4 pass: the migration adds exactly four functions, all case_filings_*", ours === "case_filings_firm_backfill,case_filings_firm_fill_only,case_filings_firm_follow,case_filings_firm_keep", ours);
  const defs = A.sql(`select string_agg(proname || ':' || prosecdef || ':' || coalesce(array_to_string(proconfig, ';'), ''), ' | ' order by proname) from pg_proc where proname like 'case_filings_%'`);
  ok("CS-W2 DW1.4 fail: none is SECURITY DEFINER, each pins its search_path with pg_temp last", !defs.includes(":true:") && defs.split(" | ").every((d) => /search_path=pg_catalog.*pg_temp$/.test(d)), defs);
  const trig = A.sql(`select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname = 'case_filings_firm_fill' and c.relname in (${TABLES.map((t) => `'${t}'`).join(",")})`);
  ok("CS-W2 DW1.4 pass: each of the nine tables has its fill trigger", trig === "9", trig);
  ok("CS-W2 DW1.4 fail: the backfill is not callable by PUBLIC", A.sql(`select has_function_privilege('public', 'case_filings_firm_backfill()', 'EXECUTE')`) === "f");
  // The follow: the ghost key gets its platform firm (a seed after the migration); CS-W1's backfill fills the case and the
  // follow fills its nine tables, past assessment_frozen, c613_no_update and filing_form_addition_mark_only.
  A.sql(`set session_replication_role = replica; insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${F3}', 'ghost-firm', 'Ghost', 'CA', 'a@ghost.example.com', now())`);
  A.sql(`select case_firm_backfill()`);
  const after = TABLES.map((t) => `${t}=${A.sql(`select count(*) from ${t} where firm_id = '${F3}'`)}/${A.sql(`select count(*) from ${t} where firm_id is null`)}`);
  ok("CS-W2 DW1.4 pass (the follow): when the ghost key's case gets its firm, its rows in all nine tables follow, frozen and append-only rows included",
    after.every((x) => x.endsWith("=1/0")), after);
  const guards = [
    A.err(`update assessment set run_type = 'RERUN' where id = '${AS1}'`), A.err(`update filing_change set kind = 'remove_filing' where id = '${u(101)}'`),
    A.err(`update filing_form_addition set form_key = 'X' where id = '${u(111)}'`), A.err(`update assessment set firm_id = null where id = '${AS1}'`),
    A.err(`update filing_change set firm_id = '${F2}', kind = 'add_back' where id = '${u(102)}'`), A.err(`update filing set mode = 'x' where id = '${u(45)}'`),
  ];
  ok("CS-W2 DW1.4 fail: the write-once and ended-stage guards still refuse every other update (a column change, a firm emptied, a firm with another change, an ended stage's filing)",
    /assessment_frozen/.test(guards[0]) && /append-only/.test(guards[1]) && /only the removed mark/.test(guards[2]) && /assessment_frozen|case_filings_firm_keep/.test(guards[3]) && /append-only|case_filings_firm_keep/.test(guards[4]) && /case_stage_ended/.test(guards[5]),
    guards.map((g) => g.slice(0, 90)));
  // Breaker m2: the fill exception compares the other columns as text, so a numerically equal but different JSON is refused.
  A.sql(`set session_replication_role = replica; insert into assessment (id, workspace_id, case_id, subject_id, config_release_id, result_json, run_type, created_by) values ('${u(203)}', '${W}', '${u(13)}', '${u(531)}', '${REL}', '{"score": 1}', 'MANUAL', 'x')`);
  const m2 = A.err(`update assessment set firm_id = '${F3}', result_json = '{"score": 1.000}' where id = '${u(203)}'`);
  ok("CS-W2 DW1.4 fail (breaker m2): a firm fill carrying a numerically equal but different JSON (1 → 1.000) is refused by the frozen guard", /assessment_frozen/.test(m2), m2.slice(0, 120));
  ok("CS-W2 DW1.4 pass: the same fill with the text unchanged goes through", A.err(`begin; update assessment set firm_id = '${F3}' where id = '${u(203)}'; rollback;`) === "");
  A.sql(`delete from assessment where id = '${u(203)}'`);
  ok("CS-W2 DW1.4 pass: a second backfill run changes nothing", A.sql(`select case_filings_firm_backfill()`) === "0");
} finally { A.drop(); }

// A forced row whose two parents are of different firms stops the migration with words.
const B = scratch("bad");
try {
  B.sql(seedBase + caseRows(1, "sample-firm", F1) + caseRows(2, "sample-solo", F2) + `
    insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id) values ('${u(49)}', '${W}', '${u(11)}', '${u(32)}', '${u(543)}', 'vv.single', 'files_own', '${u(21)}');`);
  let stop = "";
  try { B.file(join(MIG, NEW, "migration.sql")); } catch (e) { stop = String((e as { stderr?: string }).stderr ?? e); }
  ok("CS-W2 DW1.1 fail: a filing of a sample-firm case under sample-solo's group stops the migration, naming the row", /CS-W2 filings stopped: .*filing 00000000-0000-4000-8000-000000000049/.test(stop), stop.slice(0, 300));
} finally { B.drop(); }

// ------------------------------------------------------------------------------------------ 2. W1 on the copy (API)
if (!copySql(`select 1 from combination c join config_release r on r.combination_id = c.id where c.combination_key = 'vv.single' limit 1`)) {
  const tsx = join(STUDIO, "node_modules", ".bin", "tsx"), ts = ["--tsconfig", join(STUDIO, "api", "tsconfig.json")], args = [process.argv[2] ?? "4440", process.argv[3] ?? "xr_studio_accept"];
  // Their own checks may report a known failure (exit 1); the release they make is what this suite needs, checked below.
  for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"]) spawnSync(tsx, [...ts, join(STUDIO, f), ...args], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 });
}
const vv = needVisitorVisa();
const c = await openCase(vv);
const p = await prepare(c.id);
const firm = copySql(`select firm_id from runtime_case where id = '${c.id}'`);
const rows = TABLES.filter((t) => !["filing_applicant", "assessment_override", "assessment_review"].includes(t))
  .map((t) => `${t}=${copySql(`select count(*) || ':' || count(*) filter (where firm_id is distinct from '${firm}') from ${t} where case_id = '${c.id}'`)}`);
const apps = copySql(`select count(*) || ':' || count(*) filter (where a.firm_id is distinct from f.firm_id) from filing_applicant a join filing f on f.id = a.filing_id where f.case_id = '${c.id}'`);
ok("CS-W2 W1 pass: a case opened and prepared through the API (unchanged) has groups, filings, applicants and items, each carrying the case's firm",
  p.res.status === 200 && !!firm && /^submission_group=[1-9]\d*:0$/.test(rows[0]) && /^filing=[1-9]\d*:0$/.test(rows[1]) && /^filing_item=[1-9]\d*:0$/.test(rows[2]) && /^[1-9]\d*:0$/.test(apps ?? ""), [p.res.status, firm, rows, apps]);
ok("CS-W2 W1 fail: no filings row on the copy is of a firm other than its case's", copySql(`select count(*) from filing f join runtime_case k on k.id = f.case_id where f.firm_id is distinct from k.firm_id and k.firm_id is not null`) === "0");
process.exit(summary() ? 1 : 0);
