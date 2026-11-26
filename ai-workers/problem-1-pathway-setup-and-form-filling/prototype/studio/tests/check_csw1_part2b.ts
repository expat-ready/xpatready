// CS-W1 part 2b (Release 1 row R1.3; BACKLOG CS-W1; brief design/briefs/CS-W1.md "Part 2", DW3, DW4; contract v0.1 §8
// step 1; P-559 (4)): the case side's four unique rules and the firm comparisons in code move from firm_key to firm_id.
// Each named case has a pass and a fail.
//   1. a scratch database with every migration: the re-keyed rules (names, columns), numbering per platform firm, the
//      numbering function refusing in words for a key with no platform firm.
//   2. the isolated copy this suite runs on (the API, unchanged routes): DW3 another firm's staff get 404 reading, listing
//      and numbering a case; DW4 two openings at once in one firm get consecutive numbers, the firms' sequences apart; the
//      idempotency key replays within the firm; the activity feed shows only the firm's own cases.
// No model call (US$0).
//   zsh studio/tools/isolated.sh rt_csw1p2b 4490 start && tsx studio/tests/check_csw1_part2b.ts 4490 xr_studio_rt_csw1p2b
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { call, needVisitorVisa, openCase, sql as copySql } from "../acceptance/lib/m3.ts";
import { recorder } from "./runtime/api.ts";
import { SAMPLE_FIRM_ID, SAMPLE_FIRMS_SQL } from "./runtime/sample-firms.ts";

const { ok, summary } = recorder();
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", pg = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const F1 = SAMPLE_FIRM_ID["sample-firm"], F2 = SAMPLE_FIRM_ID["sample-solo"], W = u(1), CMB = u(2);

// ------------------------------------------------------------------------------------------ 1. the scratch database
const DB = `xr_studio_csw1p2b_${process.pid}`, url = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [url, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const err = (q: string) => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };
execFileSync(join(BIN, "dropdb"), [...pg, "--if-exists", "--force", DB]);
execFileSync(join(BIN, "createdb"), [...pg, DB]);
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  sql(`${SAMPLE_FIRMS_SQL} set session_replication_role = replica; insert into combination (id, workspace_id, program_def_id, combination_key, label, participants, created_by) values ('${CMB}', '${W}', '${W}', 'vv.single', 'Visitor visa', '[]', 't')`);
  const idx = sql(`select string_agg(indexname, ',' order by indexname) from pg_indexes where tablename = 'runtime_case' and indexname like 'runtime_case_workspace_id_firm_%'`);
  ok("CS-W1 part 2b pass: the case's three unique rules are on (workspace_id, firm_id, …)", idx === "runtime_case_workspace_id_firm_id_case_number_key,runtime_case_workspace_id_firm_id_idempotency_key_key,runtime_case_workspace_id_firm_id_reference_key", idx);
  ok("CS-W1 part 2b fail: none is left on firm_key", !/firm_key/.test(idx));
  const pk = sql(`select pg_get_constraintdef(oid) from pg_constraint where conname = 'firm_case_counter_pkey'`);
  ok("CS-W1 part 2b pass: the counter's primary key is (workspace_id, firm_id, year)", pk === "PRIMARY KEY (workspace_id, firm_id, year)", pk);
  // DW4 on the database: each firm counts on its own, by its platform id.
  const n = (k: string) => sql(`select runtime_next_case_number('${W}', '${k}', '2026-06-01T12:00:00Z')`);
  const seq = [n("sample-firm"), n("sample-firm"), n("sample-solo"), n("sample-firm")];
  ok("CS-W1 DW4 pass (database): numbers per platform firm, gap-free, the two firms apart", seq.join(",") === "C-2026-00001,C-2026-00002,C-2026-00001,C-2026-00003", seq);
  ok("CS-W1 DW4 pass (database): the counter rows carry the firm's id", sql(`select string_agg(firm_key || '=' || firm_id || ':' || next_value, ',' order by firm_key) from firm_case_counter`) === `sample-firm=${F1}:4,sample-solo=${F2}:2`);
  const ghost = err(`select runtime_next_case_number('${W}', 'ghost-firm', now())`);
  ok("CS-W1 part 2b fail (part 2a's breaker B8): numbering for a key with no platform firm is refused in words, never a raw NOT NULL error",
    /runtime_next_case_number: the firm "ghost-firm" has no account on the platform yet, so it cannot number a case/.test(ghost) && !/violates not-null/.test(ghost), ghost.slice(0, 200));
  const insert = (id: number, firm: string, num: string, ref: string) => `insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, firm_key, case_number, reference) values ('${u(id)}', '${W}', '${CMB}', 'user-P', 'user-O', '${firm}', '${num}', '${ref}')`;
  sql(`set session_replication_role = replica; ${insert(11, "sample-firm", "C-2026-00009", "R-1")}; ${insert(12, "sample-solo", "C-2026-00009", "R-1")}`);
  ok("CS-W1 part 2b pass: two firms may use the same reference and case number (their firm ids differ)", sql(`select count(*) from runtime_case where reference = 'R-1'`) === "2");
  const dup = err(`set session_replication_role = replica; ${insert(13, "sample-firm", "C-2026-00009", "R-2")}`);
  ok("CS-W1 part 2b fail: one firm's case number twice is refused by the firm_id rule", /runtime_case_workspace_id_firm_id_case_number_key/.test(dup), dup.slice(0, 160));
} finally { execFileSync(join(BIN, "dropdb"), [...pg, "--if-exists", "--force", DB]); }

// ------------------------------------------------------------------------------------------ 2. the copy (API)
if (!copySql(`select 1 from combination c join config_release r on r.combination_id = c.id where c.combination_key = 'vv.single' limit 1`)) {
  const tsx = join(STUDIO, "node_modules", ".bin", "tsx"), ts = ["--tsconfig", join(STUDIO, "api", "tsconfig.json")], args = [process.argv[2] ?? "4440", process.argv[3] ?? "xr_studio_accept"];
  // Their own checks may report a known failure (exit 1); the release they make is what this suite needs, checked below.
  for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"]) spawnSync(tsx, [...ts, join(STUDIO, f), ...args], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 });
}
const vv = needVisitorVisa();
const c = await openCase(vv);
const solo = "user-S";
const [read, list, num] = await Promise.all([call("GET", `/runtime/cases/${c.id}`, undefined, solo), call("GET", `/runtime/cases`, undefined, solo), call("GET", `/runtime/next-case-number`, undefined, solo)]);
ok("CS-W1 DW3 fail: sample-solo's staff reading a sample-firm case get 404 \"No such case.\", and its list does not show it",
  read.status === 404 && /No such case/.test(JSON.stringify(read.body)) && list.status === 200 && !JSON.stringify(list.body ?? "").includes(c.id), [read.status, list.status]);
ok("CS-W1 DW3 pass: the case's own firm reads it (its officer), by the case's platform firm", (await call("GET", `/runtime/cases/${c.id}`, undefined, c.officer)).status === 200);
const soloNext = copySql(`select coalesce((select next_value from firm_case_counter k join platform_firm f on f.id = k.firm_id where f.key = 'sample-solo' and k.year = extract(year from now() at time zone 'America/Toronto')::int), 1)`);
ok("CS-W1 DW3 pass: sample-solo's next number is its own sequence (its counter row, by its platform firm), not sample-firm's",
  num.status === 200 && Number((num.body?.case_number ?? "").split("-")[2]) === Number(soloNext), [num.body, soloNext]);
const both = await Promise.all([openCase(vv), openCase(vv)]);
const nums = both.map((x) => Number(copySql(`select split_part(case_number, '-', 3) from runtime_case where id = '${x.id}'`))).sort((a, b) => a - b);
ok("CS-W1 DW4 pass (API): two openings at once in one firm get consecutive numbers", nums.length === 2 && nums[1] - nums[0] === 1, nums);
const key = `csw1p2b-${Date.now().toString(36)}`;
const body = { combinationId: vv, clientActor: "user-P", principal: { displayName: "Sample Client K" }, idempotencyKey: key };
const [k1, k2] = [await call("POST", "/runtime/cases", body, c.officer), await call("POST", "/runtime/cases", body, c.officer)];
ok("CS-W1 part 2b pass: the same idempotency key in one firm replays the case (looked up by the firm's id), never a second case", k1.status === 201 && k2.body?.id === k1.body?.id && k2.body?.created === false, [k1.status, k2.status]);
const feed = await call("GET", "/activity", undefined, solo);
ok("CS-W1 DW3 fail: sample-solo's activity feed shows none of sample-firm's case lines", feed.status === 200 && !JSON.stringify(feed.body ?? "").includes(c.id.slice(0, 8)), feed.status);
process.exit(summary() ? 1 : 0);
