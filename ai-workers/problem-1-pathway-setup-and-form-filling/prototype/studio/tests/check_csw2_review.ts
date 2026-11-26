// CS-W2 part review (Release 1 row R1.3; BACKLOG CS-W2; brief design/briefs/CS-W2.md part 5; contract v0.1 §8 steps 2,
// 2a, conditions 1 and 3; P-575, P-588 (4)): the platform firm on the seven review tables. Each named case has a pass and a fail.
//   1. a scratch database: every migration before 20261126100000_shared__csw2_review_firm_id, two Sample firms, a case of each
//      and one of a key with no platform firm, each with a filing, an item and one row in each review table; then the
//      migration and every later one. DW5.1 (backfill), DW5.2 (fill), DW5.3 (each composite key, the finding's match,
//      the keep), DW5.4 (names, INVOKER, the follow past the append-only and round guards). A second scratch database: a
//      round row of one firm under another firm's round stops the migration with words (DW5.1 fail).
//   2. the isolated copy this suite runs on: W5, a finding added and a review round sent through the API, unchanged;
//      every review row carries the case's firm.
// Releases Visitor visa on the copy when missing (tests/runtime/setup_visitor_visa.ts, then acceptance/lib/setup_vv_m3.ts).
// `migrate diff` empty is check_prisma_schema.ts's (M). No model call (US$0).
//   zsh studio/tools/isolated.sh rt_csw2r 4494 start && tsx studio/tests/check_csw2_review.ts 4494 xr_studio_rt_csw2r
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { call, needVisitorVisa, openCase, prepare, sql as copySql } from "../acceptance/lib/m3.ts";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), NEW = "20261126100000_shared__csw2_review_firm_id";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", HOST = "127.0.0.1:54329", pg = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TABLES = ["review_finding", "filing_review", "readiness_pass", "review_round", "review_round_filing", "review_round_form", "review_check"];
const [W, CMB, F1, F2, F3, PARTY] = [u(1), u(2), u(3), u(4), u(5), u(6)];

function scratch(name: string) {
  const DB = `xr_studio_csw2r_${name}_${process.pid}`, url = (user = "xr_studio") => `postgresql://${user}@${HOST}/${DB}`;
  const psql = (args: string[], user?: string) => execFileSync(join(BIN, "psql"), [url(user), "-X", "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const sql = (q: string, user?: string) => psql(["-Atc", q], user);
  const err = (q: string, user?: string) => { try { sql(q, user); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };
  const file = (f: string) => psql(["-f", f]);
  execFileSync(join(BIN, "dropdb"), [...pg, "--if-exists", "--force", DB]);
  execFileSync(join(BIN, "createdb"), [...pg, DB]);
  const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
  for (const d of all.filter((x) => x < NEW)) file(join(MIG, d, "migration.sql"));
  return { sql, err, file, drop: () => execFileSync(join(BIN, "dropdb"), [...pg, "--if-exists", "--force", DB]), rest: () => { for (const d of all.filter((x) => x > NEW)) file(join(MIG, d, "migration.sql")); } };
}

// Case n (1 sample-firm, 2 sample-solo, 3 a key with no platform firm): ids by n. The filings rows carry the firm as part
// filings left them (triggers are off while seeding, as a restore).
const ids = (n: number) => ({ K: u(10 + n), ST: u(20 + n), G: u(30 + n), FL: u(40 + n), IT: u(50 + n), APP: u(500 + n * 10), PRI: u(501 + n * 10),
  RF: u(60 + n), RP: u(70 + n), RR: u(80 + n), RRF: u(90 + n), RRM: u(100 + n), RC: u(110 + n), FD: u(120 + n) });
const caseRows = (n: number, key: string, firm: string | null) => {
  const i = ids(n), f = firm ? `'${firm}'` : "null";
  return `
    insert into runtime_case (id, workspace_id, combination_id, reference, client_actor_id, created_by, firm_key, case_number, firm_id) values ('${i.K}', '${W}', '${CMB}', 'W2R-${n}', 'user-P', 'user-O', '${key}', 'C-2026-0000${n}', ${f});
    insert into answer_subject (id, workspace_id, party_id, subject_kind, label) values ('${i.APP}', '${W}', '${PARTY}', 'case', 'The application'), ('${i.PRI}', '${W}', '${PARTY}', 'principal', 'Client ${n}');
    insert into case_stage (id, workspace_id, case_id, firm_key, ord, stage_key, staff_name, client_name, combination_id, state, application_subject_id, started_from, firm_id) values ('${i.ST}', '${W}', '${i.K}', '${key}', 1, 'vv', 'V', 'V', '${CMB}', 'CURRENT', '${i.APP}', 'BEGIN', ${f});
    insert into submission_group (id, workspace_id, case_id, kind, stage_id, firm_id) values ('${i.G}', '${W}', '${i.K}', 'FAMILY', '${i.ST}', ${f});
    insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id, firm_id) values ('${i.FL}', '${W}', '${i.K}', '${i.G}', '${i.PRI}', 'vv.single', 'files_own', '${i.ST}', ${f});
    insert into filing_item (id, workspace_id, case_id, filing_id, kind, item_key, subject_id, firm_id) values ('${i.IT}', '${W}', '${i.K}', '${i.FL}', 'form', 'IMM 5257', '${i.PRI}', ${f});
    insert into filing_review (id, workspace_id, filing_id, reviewed_by, kind, licence_number, facts_hash) values ('${i.RF}', '${W}', '${i.FL}', 'user-R', 'reviewed', 'R123', 'h');
    insert into readiness_pass (id, workspace_id, filing_id, code, keys, severity, reason, passed_by) values ('${i.RP}', '${W}', '${i.FL}', 'missing_document', '{a}', 'warning', 'Sample reason', 'user-O');
    insert into review_round (id, workspace_id, case_id, number, kind, sent_by) values ('${i.RR}', '${W}', '${i.K}', 1, 'send', 'user-O');
    insert into review_round_filing (id, workspace_id, case_id, round_id, filing_id, filing_round) values ('${i.RRF}', '${W}', '${i.K}', '${i.RR}', '${i.FL}', 1);
    insert into review_round_form (id, workspace_id, case_id, round_id, round_filing_id, filing_id, item_id, form_number, subject_id, file_kind) values ('${i.RRM}', '${W}', '${i.K}', '${i.RR}', '${i.RRF}', '${i.FL}', '${i.IT}', 'IMM 5257', '${i.PRI}', 'waits');
    insert into review_check (id, workspace_id, case_id, round_filing_id, item_key, source, wording) values ('${i.RC}', '${W}', '${i.K}', '${i.RRF}', 'k', 'default', 'Sample check');
    insert into review_finding (id, workspace_id, case_id, subject_id, severity, source, quote, created_by, stage_id, filing_id) values ('${i.FD}', '${W}', '${i.K}', '${i.PRI}', 'MINOR', 'manual', 'Sample', 'user-O', '${i.ST}', '${i.FL}');`;
};
const seedBase = `set session_replication_role = replica;
  insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${F1}', 'sample-firm', 'Sample Firm', 'CA', 'a@sample-firm.example.com', now()), ('${F2}', 'sample-solo', 'Sample Solo', 'CA', 'a@sample-solo.example.com', now());
  insert into combination (id, workspace_id, program_def_id, combination_key, label, participants, created_by) values ('${CMB}', '${W}', '${W}', 'vv.single', 'Visitor visa', '[]', 't');
  insert into party (id, workspace_id) values ('${PARTY}', '${W}');`;

// ------------------------------------------------------------------------------------------ 1. the scratch database
const A = scratch("mig");
try {
  A.sql(seedBase + caseRows(1, "sample-firm", F1) + caseRows(2, "sample-solo", F2) + caseRows(3, "ghost-firm", null));
  const procs = () => A.sql(`select string_agg(p.proname, ',' order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`).split(",");
  const before = new Set(procs());
  A.file(join(MIG, NEW, "migration.sql"));
  const added = procs().filter((p) => !before.has(p));
  A.rest();
  const [a, b] = [ids(1), ids(2)];

  // ---------------------------------------------------------------- DW5.1: the backfill
  const firmsOf = (t: string) => A.sql(`select count(*) filter (where firm_id = '${F1}') || '/' || count(*) filter (where firm_id = '${F2}') || '/' || count(*) filter (where firm_id is null) from ${t}`);
  const all = TABLES.map((t) => `${t}=${firmsOf(t)}`);
  ok("CS-W2 DW5.1 pass: after the migration every row of the seven tables carries its case's firm (one of each Sample firm per table)", all.every((x) => x.endsWith("=1/1/1")), all);
  ok("CS-W2 DW5.1 fail: a case whose key has no platform firm leaves its rows empty, never another firm's", all.every((x) => /\/1$/.test(x)));

  // ---------------------------------------------------------------- DW5.2: the fill on insert
  const ins = {
    readiness_pass: (id: string, extra = "") => `insert into readiness_pass (id, workspace_id, filing_id, code, keys, severity, reason, passed_by${extra ? ", firm_id" : ""}) values ('${id}', '${W}', '${a.FL}', 'finding', '{b}', 'warning', 'Sample reason', 'user-O'${extra ? `, '${extra}'` : ""})`,
    review_finding: (id: string, extra = "") => `insert into review_finding (id, workspace_id, case_id, subject_id, severity, source, quote, created_by, stage_id${extra ? ", firm_id" : ""}) values ('${id}', '${W}', '${a.K}', '${a.PRI}', 'INFO', 'manual', 'S', 'user-O', '${a.ST}'${extra ? `, '${extra}'` : ""})`,
    review_check: (id: string, extra = "") => `insert into review_check (id, workspace_id, case_id, round_filing_id, item_key, source, wording${extra ? ", firm_id" : ""}) values ('${id}', '${W}', '${a.K}', '${a.RRF}', 'k-${id.slice(-3)}', 'program', 'Another check'${extra ? `, '${extra}'` : ""})`,
  };
  const got = Object.entries(ins).map(([t, q]) => `${t}=${A.sql(`${q(u(300 + t.length))} returning firm_id`)}`);
  ok("CS-W2 DW5.2 pass: an insert with no firm gets its parent's firm (a pass its filing's, a finding and a check their case's)", got.every((x) => x.endsWith(`=${F1}`)), got);
  const named = Object.entries(ins).map(([t, q]) => A.err(`begin; ${q(u(400 + t.length), F2)}; rollback;`));
  ok("CS-W2 DW5.2 fail: an insert naming the other Sample firm is refused (through the filing and through the case)", named.every((e) => /case_firm_fill: a \w+ row's firm must be its \w+ row's firm/.test(e)), named.map((e) => e.slice(0, 100)));
  const asB = A.err(`begin; set local app.firm_id = '${F2}'; ${ins.review_finding(u(420))}; rollback;`);
  ok("CS-W2 DW5.2 fail: with app.firm_id set to firm B, a finding on a firm A case is refused", /case_firm_fill/.test(asB), asB.slice(0, 120));

  // ---------------------------------------------------------------- DW5.3: each composite key (fill set aside), the match, the keep
  const keyCase = (t: string, fk: string, q: string) => {
    const e = A.err(`begin; alter table ${t} disable trigger case_review_firm_fill; alter table ${t} disable trigger user; ${q}; rollback;`);
    return [fk, new RegExp(`violates foreign key constraint "${fk}"`).test(e) ? "refused" : e.slice(0, 160)] as const;
  };
  // Each row names firm A with exactly one parent of firm B (b.*); its other parents stay firm A's.
  A.sql(`insert into review_round (id, workspace_id, case_id, number, kind, sent_by) values ('${u(440)}', '${W}', '${a.K}', 2, 'one_step', 'user-O')`);   // a second round of case 1, so a new round row is unique
  const rrf = (over: Record<string, string>) => { const v = { case_id: a.K, round_id: u(440), filing_id: a.FL, filing_review_id: a.RF, ...over };
    return `insert into review_round_filing (id, workspace_id, case_id, round_id, filing_id, filing_round, filing_review_id, status, review_kind, representative, decided_by, decided_at, firm_id) values ('${u(430)}', '${W}', '${v.case_id}', '${v.round_id}', '${v.filing_id}', 9, '${v.filing_review_id}', 'approved', 'reviewed', 'user-R', 'user-R', now(), '${F1}')`; };
  A.sql(`insert into filing_item (id, workspace_id, case_id, filing_id, kind, item_key, subject_id) values ('${u(441)}', '${W}', '${a.K}', '${a.FL}', 'form', 'IMM 5645', '${a.PRI}')`);   // a second item, so a new form row is unique
  const rrm = (over: Record<string, string>) => { const v = { case_id: a.K, round_id: a.RR, round_filing_id: a.RRF, filing_id: a.FL, item_id: u(441), ...over };
    return `insert into review_round_form (id, workspace_id, case_id, round_id, round_filing_id, filing_id, item_id, form_number, subject_id, file_kind, firm_id) values ('${u(431)}', '${W}', '${v.case_id}', '${v.round_id}', '${v.round_filing_id}', '${v.filing_id}', '${v.item_id}', 'X', '${a.PRI}', 'waits', '${F1}')`; };
  const keys = [
    keyCase("review_finding", "review_finding_case_id_firm_id_fkey", `${ins.review_finding(u(432), F1).replace(`'${a.K}'`, `'${b.K}'`)}`),
    keyCase("filing_review", "filing_review_filing_id_firm_id_fkey", `insert into filing_review (id, workspace_id, filing_id, reviewed_by, kind, licence_number, facts_hash, firm_id) values ('${u(433)}', '${W}', '${b.FL}', 'x', 'reviewed', 'L', 'h', '${F1}')`),
    keyCase("readiness_pass", "readiness_pass_filing_id_firm_id_fkey", ins.readiness_pass(u(434), F1).replace(`'${a.FL}'`, `'${b.FL}'`)),
    keyCase("review_round", "review_round_case_id_firm_id_fkey", `insert into review_round (id, workspace_id, case_id, number, kind, sent_by, firm_id) values ('${u(435)}', '${W}', '${b.K}', 7, 'send', 'x', '${F1}')`),
    keyCase("review_round_filing", "review_round_filing_case_id_firm_id_fkey", rrf({ case_id: b.K })),
    keyCase("review_round_filing", "review_round_filing_round_id_firm_id_fkey", rrf({ round_id: b.RR })),
    keyCase("review_round_filing", "review_round_filing_filing_id_firm_id_fkey", rrf({ filing_id: b.FL })),
    keyCase("review_round_filing", "review_round_filing_filing_review_id_firm_id_fkey", rrf({ filing_review_id: b.RF })),
    keyCase("review_round_form", "review_round_form_case_id_firm_id_fkey", rrm({ case_id: b.K })),
    keyCase("review_round_form", "review_round_form_round_id_firm_id_fkey", rrm({ round_id: b.RR })),
    keyCase("review_round_form", "review_round_form_filing_id_firm_id_fkey", rrm({ filing_id: b.FL })),
    keyCase("review_round_form", "review_round_form_round_filing_id_firm_id_fkey", rrm({ round_filing_id: b.RRF })),
    keyCase("review_round_form", "review_round_form_item_id_firm_id_fkey", rrm({ item_id: b.IT })),
    keyCase("review_check", "review_check_case_id_firm_id_fkey", ins.review_check(u(436), F1).replace(`'${a.K}'`, `'${b.K}'`)),
    keyCase("review_check", "review_check_round_filing_id_firm_id_fkey", ins.review_check(u(437), F1).replace(`'${a.RRF}'`, `'${b.RRF}'`)),
  ];
  ok("CS-W2 DW5.3 fail: through each of the fifteen composite keys, a firm A row cannot name a firm B parent (fill and guards set aside)", keys.length === 15 && keys.every(([, r]) => r === "refused"), keys.filter(([, r]) => r !== "refused"));
  ok("CS-W2 DW5.3 pass: the same row with all its parents of its own firm goes in", A.err(`begin; alter table review_round_filing disable trigger user; ${rrf({})}; rollback;`) === "");
  const match = [A.err(`update review_finding set filing_id = '${b.FL}' where id = '${a.FD}'`), A.err(`begin; insert into review_finding (id, workspace_id, case_id, subject_id, severity, source, quote, created_by, stage_id, filing_id) values ('${u(438)}', '${W}', '${a.K}', '${a.PRI}', 'INFO', 'manual', 'S', 'x', '${a.ST}', '${ids(3).FL}'); rollback;`)];
  ok("CS-W2 DW5.3 fail (the finding's filing, held by a trigger, not a key): a finding cannot name another case's filing (another firm's, or a firm-less case's), on update or insert",
    match.every((e) => /case_review_firm_match: a finding can only name a filing of its own case/.test(e)), match.map((e) => e.slice(0, 100)));
  ok("CS-W2 DW5.3 pass: a finding naming its own case's filing, or none, is allowed", A.err(`begin; update review_finding set filing_id = null where id = '${a.FD}'; update review_finding set filing_id = '${a.FL}' where id = '${a.FD}'; rollback;`) === "");
  const kept = TABLES.map((t) => A.err(`update ${t} set firm_id = null where firm_id = '${F1}'`));
  ok("CS-W2 DW5.3 fail: a firm once set cannot be emptied (which would skip the keys) in any of the seven tables, nor changed, as owner and as xr_app",
    kept.every((e) => /case_review_firm_keep: a \w+ row keeps its firm/.test(e)) && /case_review_firm_keep/.test(A.err(`update review_check set firm_id = '${F2}', round_filing_id = '${b.RRF}' where id = '${a.RC}'`, "xr_app")), kept.map((e) => e.slice(0, 90)));
  // A case holding only a review round (no filings rows), so the RESTRICT that answers is a review key (review m1).
  A.sql(`set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, reference, client_actor_id, created_by, firm_key, case_number, firm_id) values ('${u(14)}', '${W}', '${CMB}', 'W2R-4', 'user-P', 'user-O', 'sample-firm', 'C-2026-00004', '${F1}');
    insert into review_round (id, workspace_id, case_id, number, kind, sent_by, firm_id) values ('${u(84)}', '${W}', '${u(14)}', 1, 'send', 'x', '${F1}')`);
  const moveCase = A.err(`update runtime_case set firm_id = '${F2}' where id = '${u(14)}'`);
  ok("CS-W2 DW5.3 fail: a case's firm cannot move while its review round names it (ON UPDATE RESTRICT on review_round's key)", /violates RESTRICT setting of foreign key constraint "review_round_case_id_firm_id_fkey"/.test(moveCase), moveCase.slice(0, 160));
  // Breaker M1: a firm-less case's rows cannot name another case's rows (the keys skip them while the firm is empty).
  const g = ids(3);
  const cross = [
    A.err(`update review_round_filing set filing_id = '${a.FL}' where id = '${g.RRF}'`, "xr_app"),
    A.err(`update review_round_filing set filing_review_id = '${a.RF}' where id = '${g.RRF}'`, "xr_app"),
    A.err(`update review_round_form set item_id = '${a.IT}' where id = '${g.RRM}'`, "xr_app"),
    A.err(`insert into review_check (id, workspace_id, case_id, round_filing_id, item_key, source, wording) values ('${u(442)}', '${W}', '${g.K}', '${a.RRF}', 'x', 'default', 'W')`, "xr_app"),
  ];
  ok("CS-W2 DW5.3 fail (breaker M1): a firm-less case's round row, form or check cannot name another case's filing, filing review, item or round row, as xr_app",
    cross.every((e) => /case_review_same_case: a \w+ row can only name rows of its own case|case_stage_ended|c83/.test(e)) && cross.filter((e) => /case_review_same_case/.test(e)).length >= 3, cross.map((e) => e.slice(0, 110)));
  // Round 2 breaker M2: a filing item cannot move to another case or filing (its review forms were checked against it).
  const mv = [A.err(`update filing_item set case_id = '${b.K}', filing_id = '${b.FL}' where id = '${ids(3).IT}'`, "xr_app"), A.err(`update filing_item set filing_id = '${b.FL}' where id = '${a.IT}'`, "xr_app")];
  ok("CS-W2 DW5.3 fail (round 2 M2): a filing item keeps its case and filing, as xr_app (a firm-less case's item cannot move under another firm)", mv.every((e) => /case_review_case_fixed: a filing item keeps its case and filing|case_stage_ended/.test(e)) && /case_review_case_fixed/.test(mv[0]), mv.map((e) => e.slice(0, 100)));
  // Review m2: a filing review inserted with no firm takes its filing's.
  ok("CS-W2 DW5.2 pass (review m2): a filing review inserted with no firm takes its filing's firm",
    A.sql(`begin; insert into filing_review (id, workspace_id, filing_id, reviewed_by, kind, licence_number, facts_hash) values ('${u(443)}', '${W}', '${a.FL}', 'x', 'reviewed', 'L', 'h') returning firm_id; rollback;`).includes(F1));

  // ---------------------------------------------------------------- DW5.4: names, rights, the follow, the guards
  ok("CS-W2 DW5.4 pass: the migration adds exactly eight functions, all case_review_*", added.sort().join(",") === "case_review_case_fixed,case_review_filled_now,case_review_firm_backfill,case_review_firm_follow,case_review_firm_keep,case_review_firm_match,case_review_mark_fill,case_review_same_case", added);
  const defs = A.sql(`select string_agg(proname || ':' || prosecdef || ':' || coalesce(array_to_string(proconfig, ';'), ''), ' | ' order by proname) from pg_proc where proname like 'case_review_%'`);
  const definers = defs.split(" | ").filter((d) => d.includes(":true:")).map((d) => d.split(":")[0]).join(",");
  ok("CS-W2 DW5.4 fail: only the two fill-mark functions are SECURITY DEFINER (they alone touch case_review_fill_mark), and each function pins its search_path with pg_temp last",
    definers === "case_review_filled_now,case_review_mark_fill" && defs.split(" | ").every((d) => /search_path=pg_catalog, public, pg_temp$/.test(d)), defs);
  ok("CS-W2 DW5.4 fail (round 2 M2): the app can neither read nor write the fill marks, nor call the mark trigger function",
    /permission denied/.test(A.err(`select count(*) from case_review_fill_mark`, "xr_app")) && /permission denied/.test(A.err(`delete from case_review_fill_mark`, "xr_app"))
    && A.sql(`select has_function_privilege('xr_app', 'case_review_mark_fill()', 'EXECUTE')::text || has_function_privilege('public', 'case_review_filled_now(uuid)', 'EXECUTE')::text`) === "falsefalse");
  ok("CS-W2 DW5.4 fail: the backfill is not callable by PUBLIC", A.sql(`select has_function_privilege('public', 'case_review_firm_backfill()', 'EXECUTE')`) === "f");
  // Breaker M2: the ghost case's round row is decided (sent back) before its firm arrives; in the transaction that fills
  // the firm, the C8.3 "written in this transaction" opening must not let a check be added or a form stamped.
  const g4 = ids(3);
  A.sql(`set session_replication_role = replica; update review_round_filing set status = 'sent_back', reasons = '["r"]', decided_by = 'x', decided_at = now(), opened_by = 'x', opened_at = now() where id = '${g4.RRF}'`);
  A.sql(`set session_replication_role = replica; insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${F3}', 'ghost-firm', 'Ghost', 'CA', 'a@ghost.example.com', now())`);
  const m2 = A.err(`begin; select case_firm_backfill(); insert into review_check (id, workspace_id, case_id, round_filing_id, item_key, source, wording) values ('${u(444)}', '${W}', '${g4.K}', '${g4.RRF}', 'late', 'default', 'Late check'); rollback;`, "xr_studio");
  ok("CS-W2 DW5.4 fail (breaker M2): in the transaction that fills a case's firm, a check cannot be added to its sent-back round row", /the filing is decided; nothing is added to it/.test(m2), m2.slice(0, 160));
  // Round 2 M2: the fill done by hand (no follow, no backfill) and then a session setting cannot reopen it either.
  const g5 = ids(3);
  const byHand = A.err(`begin; set local session_replication_role = replica; update runtime_case set firm_id = '${F3}' where id = '${g5.K}'; update filing set firm_id = '${F3}' where case_id = '${g5.K}'; update filing_review set firm_id = '${F3}' where id = '${g5.RF}'; update review_round set firm_id = '${F3}' where id = '${g5.RR}'; set local session_replication_role = origin; update review_round_filing set firm_id = '${F3}' where id = '${g5.RRF}' and firm_id is null; set local xr.case_firm_fill = 'off'; insert into review_check (id, workspace_id, case_id, round_filing_id, item_key, source, wording) values ('${u(445)}', '${W}', '${g5.K}', '${g5.RRF}', 'late2', 'default', 'Late check'); rollback;`, "xr_studio");
  ok("CS-W2 DW5.4 fail (round 2 M2): a round row's firm filled by hand in this transaction, then any session setting: a check still cannot be added to the decided row", /the filing is decided; nothing is added to it/.test(byHand), byHand.slice(0, 160));
  ok("CS-W2 DW5.4 pass: a decided round row whose firm was not filled in this transaction behaves as before (the opening only covers the approving transaction)",
    /the filing is decided; nothing is added to it/.test(A.err(`insert into review_check (id, workspace_id, case_id, round_filing_id, item_key, source, wording) values ('${u(446)}', '${W}', '${g5.K}', '${g5.RRF}', 'late3', 'default', 'Late check')`)));
  A.sql(`select case_firm_backfill()`);
  const after = TABLES.map((t) => `${t}=${A.sql(`select count(*) filter (where firm_id = '${F3}') || '/' || count(*) filter (where firm_id is null) from ${t}`)}`);
  ok("CS-W2 DW5.4 pass (the follow): when the ghost key's case gets its firm, its rows in all seven tables follow, past the append-only and round guards", after.every((x) => x.endsWith("=1/0")), after);
  const guards = [
    A.err(`update filing_review set kind = 'self_reviewed' where id = '${a.RF}'`), A.err(`update readiness_pass set reason = 'Changed reason' where id = '${a.RP}'`),
    A.err(`update review_round set sent_by = 'x' where id = '${a.RR}'`), A.err(`update review_round_filing set filing_round = 5 where id = '${a.RRF}'`),
    A.err(`update review_round_form set form_number = 'Y' where id = '${a.RRM}'`), A.err(`update review_check set wording = 'Changed' where id = '${a.RC}'`),
  ];
  ok("CS-W2 DW5.4 fail: the append-only and round guards still refuse every other update", guards.every((g) => /append-only|never change|not an allowed move|never changes/.test(g)), guards.map((g) => g.slice(0, 90)));
  ok("CS-W2 DW5.4 pass: a second backfill run changes nothing", A.sql(`select case_review_firm_backfill()`) === "0");
} finally { A.drop(); }

const B = scratch("bad");
try {
  const [a, b] = [ids(1), ids(2)];
  B.sql(seedBase + caseRows(1, "sample-firm", F1) + caseRows(2, "sample-solo", F2) + `
    update review_round_filing set round_id = '${b.RR}' where id = '${a.RRF}';`);
  let stop = "";
  try { B.file(join(MIG, NEW, "migration.sql")); } catch (e) { stop = String((e as { stderr?: string }).stderr ?? e); }
  ok("CS-W2 DW5.1 fail: a sample-firm round row under sample-solo's round stops the migration, naming the row", new RegExp(`CS-W2 review stopped: .*review_round_filing ${a.RRF} \\(round_id names a row of another firm\\)`).test(stop), stop.slice(0, 300));
} finally { B.drop(); }

// ------------------------------------------------------------------------------------------ 2. W5 on the copy (API)
if (!copySql(`select 1 from combination c join config_release r on r.combination_id = c.id where c.combination_key = 'vv.single' limit 1`)) {
  const tsx = join(STUDIO, "node_modules", ".bin", "tsx"), ts = ["--tsconfig", join(STUDIO, "api", "tsconfig.json")], args = [process.argv[2] ?? "4440", process.argv[3] ?? "xr_studio_accept"];
  // Their own checks may report a known failure (exit 1); the release they make is what this suite needs, checked below.
  for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"]) spawnSync(tsx, [...ts, join(STUDIO, f), ...args], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 });
}
const vv = needVisitorVisa();
const c = await openCase(vv);
const p = await prepare(c.id);
const principal = Object.values(c.subjects)[0];
const finding = await call("POST", `/runtime/cases/${c.id}/findings`, { subject: principal, severity: "MINOR", note: "Sample finding (CS-W2 W5)" }, c.officer);
const filingIds = (p.p?.filings ?? []).map((f) => f.id);
const round = await call("POST", `/runtime/cases/${c.id}/reviews`, { filings: filingIds.slice(0, 1) }, c.officer);
const firm = copySql(`select firm_id from runtime_case where id = '${c.id}'`);
const rows = ["review_finding", "review_round", "review_round_filing", "review_round_form", "review_check"].map((t) => `${t}=${copySql(`select count(*) || ':' || count(*) filter (where firm_id is distinct from '${firm}') from ${t} where case_id = '${c.id}'`)}`);
ok("CS-W2 W5 pass: a finding added and a review round sent through the API (unchanged): the finding, the round, its filing row, forms and checks carry the case's firm",
  finding.status < 300 && round.status === 201 && !!firm && rows.slice(0, 3).every((r) => /=[1-9]\d*:0$/.test(r)) && rows.slice(3).every((r) => /=\d+:0$/.test(r)), [finding.status, finding.body?.detail, round.status, round.body?.detail, rows]);
ok("CS-W2 W5 fail: no review row on the copy is of a firm other than its case's", copySql(`select count(*) from review_round_filing r join runtime_case k on k.id = r.case_id where r.firm_id is distinct from k.firm_id and k.firm_id is not null`) === "0");
process.exit(summary() ? 1 : 0);
