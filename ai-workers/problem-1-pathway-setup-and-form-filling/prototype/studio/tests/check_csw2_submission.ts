// CS-W2 part submission (Release 1 row R1.3; BACKLOG CS-W2; brief design/briefs/CS-W2.md part 6; contract v0.1 §8 steps 2,
// 2a, conditions 1 and 3; P-575, P-588 (4)): the platform firm on the six submission tables. Each named case has a pass and a fail.
//   1. a scratch database: every migration before 20261126110000_shared__csw2_submission_firm_id, two Sample firms, a case of
//      each and one of a key with no platform firm, each with a filing, an item and one row in each submission table; then
//      the migration and every later one. DW6.1 (backfill), DW6.2 (fill), DW6.3 (each composite key, the keep), DW6.4 (names,
//      INVOKER, the follow past the append-only and record guards). A second scratch database: a firm A record under firm
//      B's group stops the migration with words (DW6.1 fail).
//   2. the isolated copy this suite runs on: W6, a form printed, signed and its signed scan uploaded through the API, unchanged;
//      the sign steps and the scan carry the case's firm.
// Releases Visitor visa on the copy when missing (tests/runtime/setup_visitor_visa.ts, then acceptance/lib/setup_vv_m3.ts).
// `migrate diff` empty is check_prisma_schema.ts's (M). No model call (US$0).
//   zsh studio/tools/isolated.sh rt_csw2s 4492 start && tsx studio/tests/check_csw2_submission.ts 4492 xr_studio_rt_csw2s
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { needVisitorVisa, openCase, prepare, signByHand, sql as copySql } from "../acceptance/lib/m3.ts";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), NEW = "20261126110000_shared__csw2_submission_firm_id";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", HOST = "127.0.0.1:54329", pg = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SHA = "0".repeat(64);
const TABLES = ["sign_step", "signed_scan", "filing_record", "fee_receipt_file", "filing_person_record", "filing_record_correction"];
const [W, CMB, F1, F2, F3, PARTY] = [u(1), u(2), u(3), u(4), u(5), u(6)];

function scratch(name: string) {
  const DB = `xr_studio_csw2s_${name}_${process.pid}`, url = (user = "xr_studio") => `postgresql://${user}@${HOST}/${DB}`;
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

const ids = (n: number) => ({ K: u(10 + n), ST: u(20 + n), G: u(30 + n), FL: u(40 + n), IT: u(50 + n), APP: u(500 + n * 10), PRI: u(501 + n * 10),
  SS: u(60 + n), SC: u(70 + n), FR: u(80 + n), FE: u(90 + n), PR: u(100 + n), CO: u(110 + n) });
const caseRows = (n: number, key: string, firm: string | null) => {
  const i = ids(n), f = firm ? `'${firm}'` : "null";
  return `
    insert into runtime_case (id, workspace_id, combination_id, reference, client_actor_id, created_by, firm_key, case_number, firm_id) values ('${i.K}', '${W}', '${CMB}', 'W2S-${n}', 'user-P', 'user-O', '${key}', 'C-2026-0000${n}', ${f});
    insert into answer_subject (id, workspace_id, party_id, subject_kind, label) values ('${i.APP}', '${W}', '${PARTY}', 'case', 'The application'), ('${i.PRI}', '${W}', '${PARTY}', 'principal', 'Client ${n}');
    insert into case_stage (id, workspace_id, case_id, firm_key, ord, stage_key, staff_name, client_name, combination_id, state, application_subject_id, started_from, firm_id) values ('${i.ST}', '${W}', '${i.K}', '${key}', 1, 'vv', 'V', 'V', '${CMB}', 'CURRENT', '${i.APP}', 'BEGIN', ${f});
    insert into submission_group (id, workspace_id, case_id, kind, stage_id, firm_id) values ('${i.G}', '${W}', '${i.K}', 'FAMILY', '${i.ST}', ${f});
    insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id, firm_id) values ('${i.FL}', '${W}', '${i.K}', '${i.G}', '${i.PRI}', 'vv.single', 'files_own', '${i.ST}', ${f});
    insert into filing_item (id, workspace_id, case_id, filing_id, kind, item_key, subject_id, firm_id) values ('${i.IT}', '${W}', '${i.K}', '${i.FL}', 'form', 'IMM 5257', '${i.PRI}', ${f});
    insert into sign_step (id, workspace_id, case_id, item_id, key, done_by) values ('${i.SS}', '${W}', '${i.K}', '${i.IT}', 'signed', 'user-O');
    insert into signed_scan (id, workspace_id, case_id, item_id, file_name, media_type, size_bytes, sha256, path, uploaded_by) values ('${i.SC}', '${W}', '${i.K}', '${i.IT}', 'a.pdf', 'application/pdf', 10, '${SHA}', 'p', 'user-O');
    insert into filing_record (id, workspace_id, case_id, filing_id, submission_group_id, our_reference, submitted_on, application_number, prepared_by, recorded_by, filed_facts) values ('${i.FR}', '${W}', '${i.K}', '${i.FL}', '${i.G}', 'REF-${n}', '2026-11-02', 'V30000000${n}', 'user-O', 'user-O', '{}');
    insert into fee_receipt_file (id, workspace_id, case_id, filing_id, file_name, media_type, size_bytes, sha256, path, uploaded_by) values ('${i.FE}', '${W}', '${i.K}', '${i.FL}', 'r.pdf', 'application/pdf', 10, '${SHA}', 'p', 'user-O');
    insert into filing_person_record (id, workspace_id, filing_id, subject_id, uci, recorded_by) values ('${i.PR}', '${W}', '${i.FL}', '${i.PRI}', '1100000${n}', 'user-O');
    insert into filing_record_correction (id, workspace_id, filing_id, before, after, reason, corrected_by) values ('${i.CO}', '${W}', '${i.FL}', 'V1', 'V2', 'Sample reason', 'user-O');`;
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

  // ---------------------------------------------------------------- DW6.1: the backfill
  const firmsOf = (t: string) => A.sql(`select count(*) filter (where firm_id = '${F1}') || '/' || count(*) filter (where firm_id = '${F2}') || '/' || count(*) filter (where firm_id is null) from ${t}`);
  const all = TABLES.map((t) => `${t}=${firmsOf(t)}`);
  ok("CS-W2 DW6.1 pass: after the migration every row of the six tables carries its case's firm (one of each Sample firm per table)", all.every((x) => x.endsWith("=1/1/1")), all);
  ok("CS-W2 DW6.1 fail: a case whose key has no platform firm leaves its rows empty, never another firm's", all.every((x) => /\/1$/.test(x)));

  // ---------------------------------------------------------------- DW6.2: the fill on insert
  const ins = {
    sign_step: (id: string, firm = "") => `insert into sign_step (id, workspace_id, case_id, item_id, key, done_by${firm ? ", firm_id" : ""}) values ('${id}', '${W}', '${a.K}', '${a.IT}', 'uploaded_to_ircc', 'user-O'${firm ? `, '${firm}'` : ""})`,
    filing_person_record: (id: string, firm = "") => `insert into filing_person_record (id, workspace_id, filing_id, subject_id, uci, recorded_by${firm ? ", firm_id" : ""}) values ('${id}', '${W}', '${a.FL}', '${u(id.length + Number(id.slice(-3)))}', '12345678', 'user-O'${firm ? `, '${firm}'` : ""})`,
    filing_record_correction: (id: string, firm = "") => `insert into filing_record_correction (id, workspace_id, filing_id, before, after, reason, corrected_by${firm ? ", firm_id" : ""}) values ('${id}', '${W}', '${a.FL}', 'V2', 'V3', 'Sample reason', 'user-O'${firm ? `, '${firm}'` : ""})`,
  };
  const got = Object.entries(ins).map(([t, q], k) => `${t}=${A.sql(`${q(u(300 + k))} returning firm_id`)}`);
  ok("CS-W2 DW6.2 pass: an insert with no firm gets its parent's firm (a sign step its case's; a UCI and a correction their filing's)", got.every((x) => x.endsWith(`=${F1}`)), got);
  const named = Object.entries(ins).map(([, q], k) => A.err(`begin; ${q(u(310 + k), F2)}; rollback;`));
  ok("CS-W2 DW6.2 fail: an insert naming the other Sample firm is refused (through the case and through the filing)", named.every((e) => /case_firm_fill: a \w+ row's firm must be its \w+ row's firm/.test(e)), named.map((e) => e.slice(0, 100)));
  const asB = A.err(`begin; set local app.firm_id = '${F2}'; ${ins.filing_record_correction(u(320))}; rollback;`);
  ok("CS-W2 DW6.2 fail: with app.firm_id set to firm B, a correction on a firm A filing is refused", /case_firm_fill/.test(asB), asB.slice(0, 120));

  // ---------------------------------------------------------------- DW6.3: each composite key (fill and guards set aside), the keep
  const keyCase = (t: string, fk: string, q: string) => {
    const e = A.err(`begin; alter table ${t} disable trigger user; ${q}; rollback;`);
    return [fk, new RegExp(`violates foreign key constraint "${fk}"`).test(e) ? "refused" : e.slice(0, 160)] as const;
  };
  A.sql(`insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id) values ('${u(330)}', '${W}', '${a.K}', '${a.G}', '${u(331)}', 'vv.single', 'files_own', '${a.ST}')`);   // a second filing of case 1, with no record yet
  A.sql(`insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id) values ('${u(340)}', '${W}', '${b.K}', '${b.G}', '${u(341)}', 'vv.single', 'files_own', '${b.ST}')`);   // and one of case 2
  const rec = (over: Record<string, string>) => { const v = { case_id: a.K, filing_id: u(330), submission_group_id: a.G, ...over };
    return `insert into filing_record (id, workspace_id, case_id, filing_id, submission_group_id, our_reference, submitted_on, application_number, prepared_by, recorded_by, filed_facts, firm_id) values ('${u(332)}', '${W}', '${v.case_id}', '${v.filing_id}', '${v.submission_group_id}', 'R', '2026-11-02', 'V9', 'x', 'x', '{}', '${F1}')`; };
  const fee = (over: Record<string, string>) => { const v = { case_id: a.K, filing_id: a.FL, ...over };
    return `insert into fee_receipt_file (id, workspace_id, case_id, filing_id, file_name, media_type, size_bytes, sha256, path, uploaded_by, firm_id) values ('${u(333)}', '${W}', '${v.case_id}', '${v.filing_id}', 'r.pdf', 'application/pdf', 1, '${SHA}', 'p', 'x', '${F1}')`; };
  const keys = [
    keyCase("sign_step", "sign_step_case_id_firm_id_fkey", ins.sign_step(u(334), F1).replace(`'${a.K}'`, `'${b.K}'`).replace("'uploaded_to_ircc'", "'scan_received'")),
    keyCase("sign_step", "sign_step_item_id_firm_id_fkey", ins.sign_step(u(335), F1).replace(`'${a.IT}'`, `'${b.IT}'`).replace("'uploaded_to_ircc'", "'sign_in_pen'")),
    keyCase("signed_scan", "signed_scan_case_id_firm_id_fkey", `insert into signed_scan (id, workspace_id, case_id, item_id, file_name, media_type, size_bytes, sha256, path, uploaded_by, firm_id) values ('${u(336)}', '${W}', '${b.K}', '${a.IT}', 'a.pdf', 'application/pdf', 1, '${SHA}', 'p', 'x', '${F1}')`),
    keyCase("signed_scan", "signed_scan_item_id_firm_id_fkey", `insert into signed_scan (id, workspace_id, case_id, item_id, file_name, media_type, size_bytes, sha256, path, uploaded_by, firm_id) values ('${u(337)}', '${W}', '${a.K}', '${b.IT}', 'a.pdf', 'application/pdf', 1, '${SHA}', 'p', 'x', '${F1}')`),
    keyCase("filing_record", "filing_record_case_id_firm_id_fkey", rec({ case_id: b.K })),
    keyCase("filing_record", "filing_record_filing_id_firm_id_fkey", rec({ filing_id: u(340) })),
    keyCase("filing_record", "filing_record_submission_group_id_firm_id_fkey", rec({ submission_group_id: b.G })),
    keyCase("fee_receipt_file", "fee_receipt_file_case_id_firm_id_fkey", fee({ case_id: b.K })),
    keyCase("fee_receipt_file", "fee_receipt_file_filing_id_firm_id_fkey", fee({ filing_id: b.FL })),
    keyCase("filing_person_record", "filing_person_record_filing_id_firm_id_fkey", ins.filing_person_record(u(338), F1).replace(`'${a.FL}'`, `'${b.FL}'`)),
    keyCase("filing_record_correction", "filing_record_correction_filing_id_firm_id_fkey", ins.filing_record_correction(u(339), F1).replace(`'${a.FL}'`, `'${b.FL}'`)),
  ];
  ok("CS-W2 DW6.3 fail: through each of the eleven composite keys, a firm A row cannot name a firm B parent (fill and guards set aside)", keys.length === 11 && keys.every(([, r]) => r === "refused"), keys.filter(([, r]) => r !== "refused"));
  ok("CS-W2 DW6.3 pass: the same record with all its parents of its own firm goes in", A.err(`begin; alter table filing_record disable trigger user; ${rec({})}; rollback;`) === "");
  const kept = TABLES.map((t) => A.err(`update ${t} set firm_id = null where firm_id = '${F1}'`));
  ok("CS-W2 DW6.3 fail: a firm once set cannot be emptied (which would skip the keys) in any of the six tables, nor changed, as owner and as xr_app",
    kept.every((e) => /case_submission_firm_keep: a \w+ row keeps its firm/.test(e)) && /case_submission_firm_keep/.test(A.err(`update sign_step set firm_id = null, item_id = '${b.IT}' where id = '${a.SS}'`, "xr_app")), kept.map((e) => e.slice(0, 90)));
  const moveCase = A.err(`update runtime_case set firm_id = '${F2}' where id = '${a.K}'`);
  ok("CS-W2 DW6.3 fail: a case's firm cannot move while its submission rows name it (ON UPDATE RESTRICT)", /violates RESTRICT setting of foreign key constraint/.test(moveCase), moveCase.slice(0, 160));

  // ---------------------------------------------------------------- DW6.4: names, rights, the follow, the guards
  ok("CS-W2 DW6.4 pass: the migration adds exactly three functions, all case_submission_*", added.sort().join(",") === "case_submission_firm_backfill,case_submission_firm_follow,case_submission_firm_keep", added);
  const defs = A.sql(`select string_agg(proname || ':' || prosecdef || ':' || coalesce(array_to_string(proconfig, ';'), ''), ' | ' order by proname) from pg_proc where proname like 'case_submission_%'`);
  ok("CS-W2 DW6.4 fail: none is SECURITY DEFINER, each pins its search_path with pg_temp last", !defs.includes(":true:") && defs.split(" | ").every((d) => /search_path=pg_catalog, public, pg_temp$/.test(d)), defs);
  ok("CS-W2 DW6.4 fail: the backfill is not callable by PUBLIC", A.sql(`select has_function_privilege('public', 'case_submission_firm_backfill()', 'EXECUTE')`) === "f");
  A.sql(`set session_replication_role = replica; insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${F3}', 'ghost-firm', 'Ghost', 'CA', 'a@ghost.example.com', now())`);
  A.sql(`select case_firm_backfill()`);
  const after = TABLES.map((t) => `${t}=${A.sql(`select count(*) filter (where firm_id = '${F3}') || '/' || count(*) filter (where firm_id is null) from ${t}`)}`);
  ok("CS-W2 DW6.4 pass (the follow): when the ghost key's case gets its firm, its rows in all six tables follow, past the append-only and record guards", after.every((x) => x.endsWith("=1/0")), after);
  const guards = [
    A.err(`update signed_scan set file_name = 'b.pdf' where id = '${a.SC}'`), A.err(`update fee_receipt_file set file_name = 'b.pdf' where id = '${a.FE}'`),
    A.err(`update filing_record set our_reference = 'X' where id = '${a.FR}'`), A.err(`update filing_person_record set recorded_by = 'x' where id = '${a.PR}'`),
    A.err(`update filing_record_correction set reason = 'Other reason' where id = '${a.CO}'`),
  ];
  ok("CS-W2 DW6.4 fail: the append-only and record guards still refuse every other update", guards.every((g) => /append-only|changes only in/.test(g)), guards.map((g) => g.slice(0, 90)));
  ok("CS-W2 DW6.4 pass: a correction still changes only the application number", A.err(`begin; update filing_record set application_number = 'V999' where id = '${a.FR}'; rollback;`) === "");
  ok("CS-W2 DW6.4 pass: a second backfill run changes nothing", A.sql(`select case_submission_firm_backfill()`) === "0");
} finally { A.drop(); }

const B = scratch("bad");
try {
  const [a, b] = [ids(1), ids(2)];
  B.sql(seedBase + caseRows(1, "sample-firm", F1) + caseRows(2, "sample-solo", F2) + `
    update filing_record set submission_group_id = '${b.G}' where id = '${a.FR}';`);
  let stop = "";
  try { B.file(join(MIG, NEW, "migration.sql")); } catch (e) { stop = String((e as { stderr?: string }).stderr ?? e); }
  ok("CS-W2 DW6.1 fail: a sample-firm record under sample-solo's group stops the migration, naming the row", new RegExp(`CS-W2 submission stopped: .*filing_record ${a.FR} \\(submission_group_id names a row of another firm\\)`).test(stop), stop.slice(0, 300));
} finally { B.drop(); }

// ------------------------------------------------------------------------------------------ 2. W6 on the copy (API)
if (!copySql(`select 1 from combination c join config_release r on r.combination_id = c.id where c.combination_key = 'vv.single' limit 1`)) {
  const tsx = join(STUDIO, "node_modules", ".bin", "tsx"), ts = ["--tsconfig", join(STUDIO, "api", "tsconfig.json")], args = [process.argv[2] ?? "4440", process.argv[3] ?? "xr_studio_accept"];
  // Their own checks may report a known failure (exit 1); the release they make is what this suite needs, checked below.
  for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"]) spawnSync(tsx, [...ts, join(STUDIO, f), ...args], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 });
}
const vv = needVisitorVisa();
const c = await openCase(vv);
await prepare(c.id);
// The representative's form (IMM 5476) is signed by hand: print, signed, and the signed scan, as m3's signByHand does.
const it5476 = copySql(`select i.id || ' ' || i.subject_id from filing_item i where i.case_id = '${c.id}' and i.item_key = 'IMM 5476' and i.active limit 1`) ?? "";
const scan = await signByHand(c.id, it5476.split(" ")[0], "IMM 5476", it5476.split(" ")[1]);
const firm = copySql(`select firm_id from runtime_case where id = '${c.id}'`);
const rows = ["sign_step", "signed_scan"].map((t) => `${t}=${copySql(`select count(*) || ':' || count(*) filter (where firm_id is distinct from '${firm}') from ${t} where case_id = '${c.id}'`)}`);
ok("CS-W2 W6 pass: a form printed, signed and its signed scan uploaded through the API (unchanged): the sign steps and the scan carry the case's firm",
  scan < 300 && !!firm && rows.every((r) => /=[1-9]\d*:0$/.test(r)), [it5476, scan, rows]);
ok("CS-W2 W6 fail: no submission row on the copy is of a firm other than its case's", copySql(`select count(*) from sign_step s join runtime_case k on k.id = s.case_id where s.firm_id is distinct from k.firm_id and k.firm_id is not null`) === "0");
process.exit(summary() ? 1 : 0);
