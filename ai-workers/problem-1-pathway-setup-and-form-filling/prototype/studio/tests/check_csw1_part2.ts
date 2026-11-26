// CS-W1 part 2a (Release 1 row R1.3; BACKLOG CS-W1; brief design/briefs/CS-W1.md "Part 2"; contract v0.1 §8 step 1; P-575,
// P-588 (4)): the platform firm is required on runtime_case, case_stage and firm_case_counter. Each named case has a pass
// and a fail.
//   1. scratch databases with every migration before 20261126160000_cases__csw1_firm_required:
//      DW8 a key with no platform firm stops the migration naming it; the same data with its firm migrates, filled.
//      NOT NULL: an insert whose key has no platform firm is refused; a restore-style (replica) insert still gets its firm.
//      DW6 a case's, a counter row's or a stage's firm_id or firm_key never changes (owner and xr_app); same values pass.
//      DW7 the new function is case_firm_*, SECURITY INVOKER, search_path pinned.
//   2. the isolated copy this suite runs on: a case opened through the API (unchanged) gets its firm and its number.
// `migrate diff` empty is check_prisma_schema.ts's (M). No model call (US$0).
//   zsh studio/tools/isolated.sh rt_csw1p2 4491 start && tsx studio/tests/check_csw1_part2.ts 4491 xr_studio_rt_csw1p2
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { needVisitorVisa, openCase, sql as copySql } from "../acceptance/lib/m3.ts";
import { recorder } from "./runtime/api.ts";
import { SAMPLE_FIRM_ID, SAMPLE_FIRMS_SQL } from "./runtime/sample-firms.ts";

const { ok, summary } = recorder();
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), NEW = "20261126160000_cases__csw1_firm_required";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", HOST = "127.0.0.1:54329", pg = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [W, CMB] = [u(1), u(2)];
const F1 = SAMPLE_FIRM_ID["sample-firm"], F2 = SAMPLE_FIRM_ID["sample-solo"];

function scratch(name: string) {
  const DB = `xr_studio_csw1p2_${name}_${process.pid}`, url = (user = "xr_studio") => `postgresql://${user}@${HOST}/${DB}`;
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
// A case of key k (no firm_id given: the old shape), its counter and its stage, written as a restore would (replica).
const caseRows = (n: number, k: string) => `
  insert into runtime_case (id, workspace_id, combination_id, reference, client_actor_id, created_by, firm_key, case_number) values ('${u(10 + n)}', '${W}', '${CMB}', 'P2-${n}', 'user-P', 'user-O', '${k}', 'C-2026-0000${n}');
  insert into answer_subject (id, workspace_id, party_id, subject_kind, label) values ('${u(500 + n)}', '${W}', '${u(6)}', 'case', 'The application');
  insert into case_stage (id, workspace_id, case_id, firm_key, ord, stage_key, staff_name, client_name, combination_id, state, application_subject_id, started_from) values ('${u(20 + n)}', '${W}', '${u(10 + n)}', '${k}', 1, 'vv', 'V', 'V', '${CMB}', 'CURRENT', '${u(500 + n)}', 'BEGIN');
  insert into firm_case_counter (workspace_id, firm_key, year, next_value) values ('${W}', '${k}', 2026, 2);`;
const base = `insert into combination (id, workspace_id, program_def_id, combination_key, label, participants, created_by) values ('${CMB}', '${W}', '${W}', 'vv.single', 'Visitor visa', '[]', 't');
  insert into party (id, workspace_id) values ('${u(6)}', '${W}');`;

// ------------------------------------------------------------------------------------------ DW8: the stop
const S = scratch("stop");
try {
  S.sql(`set session_replication_role = replica; ${SAMPLE_FIRMS_SQL} ${base} ${caseRows(1, "sample-firm")} ${caseRows(2, "ghost-firm")}`);
  let stop = "";
  try { S.file(join(MIG, NEW, "migration.sql")); } catch (e) { stop = String((e as { stderr?: string }).stderr ?? e); }
  ok("CS-W1 DW8 fail: a key with no platform firm stops the migration, naming the key in each table and telling what to do",
    /CS-W1 part 2 stopped: these firm keys have no platform firm yet: .*runtime_case "ghost-firm".*\(run the Sample seed, then migrate again\)/.test(stop)
    && /case_stage "ghost-firm"/.test(stop) && /firm_case_counter "ghost-firm"/.test(stop) && !/sample-firm/.test(stop), stop.slice(0, 400));
  ok("CS-W1 DW8 fail: nothing of the migration is left behind (the columns stay nullable)",
    S.sql(`select count(*) from information_schema.columns where column_name = 'firm_id' and is_nullable = 'YES' and table_name in ('runtime_case', 'case_stage', 'firm_case_counter')`) === "3");
} finally { S.drop(); }

const A = scratch("mig");
try {
  // The same rows, the ghost key now given its platform firm (the seed after it): the backfill fills, then NOT NULL.
  A.sql(`set session_replication_role = replica; ${SAMPLE_FIRMS_SQL} ${base} ${caseRows(1, "sample-firm")} ${caseRows(2, "sample-solo")}
    insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${u(9)}', 'ghost-firm', 'Ghost', 'CA', 'a@ghost.example.com', now());
    ${caseRows(3, "ghost-firm")}`);
  const procs = () => A.sql(`select string_agg(p.proname, ',' order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`).split(",");
  const before = new Set(procs());
  A.file(join(MIG, NEW, "migration.sql"));
  const added = procs().filter((p) => !before.has(p));
  A.rest();
  const firmOf = (t: string) => A.sql(`select string_agg(firm_key || '=' || coalesce(firm_id::text, 'null'), ',' order by firm_key) from ${t}`);
  const want = `ghost-firm=${u(9)},sample-firm=${F1},sample-solo=${F2}`;
  ok("CS-W1 DW8 pass: once every key has its platform firm the migration runs, every case, stage and counter filled", [firmOf("runtime_case"), firmOf("case_stage"), firmOf("firm_case_counter")].every((x) => x === want), [firmOf("runtime_case"), firmOf("case_stage")]);
  ok("CS-W1 part 2 pass: the three columns are NOT NULL", A.sql(`select count(*) from information_schema.columns where column_name = 'firm_id' and is_nullable = 'NO' and table_name in ('runtime_case', 'case_stage', 'firm_case_counter')`) === "3");

  // ---------------------------------------------------------------- NOT NULL and the fill on a restore
  const noFirm = A.err(`insert into runtime_case (id, workspace_id, combination_id, reference, client_actor_id, created_by, firm_key, case_number) values ('${u(30)}', '${W}', '${CMB}', 'P2-X', 'user-P', 'user-O', 'nobody-firm', 'C-2026-00099')`);
  ok("CS-W1 part 2 fail: a case whose key has no platform firm is refused (NOT NULL), never stored without a firm", /null value in column "firm_id" of relation "runtime_case" violates not-null constraint/.test(noFirm), noFirm.slice(0, 160));
  const restored = A.sql(`set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, reference, client_actor_id, created_by, firm_key, case_number) values ('${u(31)}', '${W}', '${CMB}', 'P2-R', 'user-P', 'user-O', 'sample-solo', 'C-2026-00031') returning firm_id`);
  ok("CS-W1 part 2 pass: a restore-style insert (replica) with no firm_id still gets its key's firm (the fill fires ALWAYS)", restored.endsWith(F2), restored);
  const wrong = A.err(`set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, reference, client_actor_id, created_by, firm_key, case_number, firm_id) values ('${u(32)}', '${W}', '${CMB}', 'P2-W', 'user-P', 'user-O', 'sample-solo', 'C-2026-00032', '${F1}')`);
  ok("CS-W1 part 2 fail: a restore-style insert naming another firm than its key's is refused too", /case_firm_from_key: the firm id given is not the platform firm of key "sample-solo"/.test(wrong), wrong.slice(0, 160));

  // ---------------------------------------------------------------- DW6: the firm never changes
  const moves = [
    A.err(`update runtime_case set firm_id = '${F2}' where id = '${u(11)}'`), A.err(`update runtime_case set firm_key = 'sample-solo' where id = '${u(11)}'`),
    A.err(`update firm_case_counter set firm_key = 'sample-solo', firm_id = '${F2}' where firm_key = 'sample-firm'`), A.err(`update case_stage set firm_id = '${F2}' where id = '${u(21)}'`),
    A.err(`update case_stage set firm_key = 'ghost-firm' where id = '${u(21)}'`, "xr_app"),
  ];
  ok("CS-W1 DW6 fail: a case's, a counter row's or a stage's firm_id or firm_key cannot change (as owner and as xr_app)",
    moves.every((e) => /case_firm_fixed: a \w+ row keeps its firm/.test(e)), moves.map((e) => e.slice(0, 90)));
  const replicaMove = A.err(`set session_replication_role = replica; update runtime_case set firm_id = '${F2}' where id = '${u(11)}'`);
  ok("CS-W1 DW6 fail (review m2): a replica-mode writer cannot change a case's firm either (the guard fires ALWAYS)", /case_firm_fixed: a runtime_case row keeps its firm/.test(replicaMove), replicaMove.slice(0, 120));
  ok("CS-W1 DW6 pass: an update naming the columns with the same values, or other columns, goes through",
    A.err(`begin; update runtime_case set firm_id = firm_id, firm_key = firm_key, reference = 'P2-1b' where id = '${u(11)}'; update firm_case_counter set next_value = next_value + 1 where firm_key = 'sample-firm'; rollback;`) === "");

  // ---------------------------------------------------------------- DW7: names, rights
  ok("CS-W1 DW7 pass: the migration adds exactly one function, case_firm_fixed", added.join(",") === "case_firm_fixed", added);
  ok("CS-W1 DW7 fail: it is SECURITY INVOKER with its search_path pinned, pg_temp last",
    A.sql(`select prosecdef::text || ':' || array_to_string(proconfig, ';') from pg_proc where proname = 'case_firm_fixed'`) === "false:search_path=pg_catalog, public, pg_temp");
  ok("CS-W1 part 2 pass: the three fills and the three guards fire ALWAYS ('A'), also for a replica-mode writer",
    A.sql(`select string_agg(c.relname || '.' || t.tgname || '=' || t.tgenabled::text, ',' order by c.relname, t.tgname) from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname in ('case_firm_from_key', 'case_firm_fill', 'case_firm_fixed') and c.relname in ('runtime_case', 'case_stage', 'firm_case_counter')`)
      === "case_stage.case_firm_fill=A,case_stage.case_firm_fixed=A,firm_case_counter.case_firm_fixed=A,firm_case_counter.case_firm_from_key=A,runtime_case.case_firm_fixed=A,runtime_case.case_firm_from_key=A");
} finally { A.drop(); }

// ------------------------------------------------------------------------------------------ 2. the copy (API)
if (!copySql(`select 1 from combination c join config_release r on r.combination_id = c.id where c.combination_key = 'vv.single' limit 1`)) {
  const tsx = join(STUDIO, "node_modules", ".bin", "tsx"), ts = ["--tsconfig", join(STUDIO, "api", "tsconfig.json")], args = [process.argv[2] ?? "4440", process.argv[3] ?? "xr_studio_accept"];
  // Their own checks may report a known failure (exit 1); the release they make is what this suite needs, checked below.
  for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"]) spawnSync(tsx, [...ts, join(STUDIO, f), ...args], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 });
}
const vv = needVisitorVisa();
const c = await openCase(vv);
const row = copySql(`select (c.firm_id = f.id)::text || ':' || coalesce(c.case_number, '') from runtime_case c join platform_firm f on f.key = c.firm_key where c.id = '${c.id}'`) ?? "";
ok("CS-W1 part 2 pass: a case opened through the API (unchanged) carries its key's platform firm and gets its case number", /^true:C-\d{4}-\d{5}$/.test(row), row);
ok("CS-W1 part 2 fail: no case, stage or counter on the copy is without a firm", copySql(`select (select count(*) from runtime_case where firm_id is null) + (select count(*) from case_stage where firm_id is null) + (select count(*) from firm_case_counter where firm_id is null)`) === "0");
process.exit(summary() ? 1 : 0);
