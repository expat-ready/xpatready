// PF-8b F7 (Amazon RDS; R1.13, R1.15, R1.5, R1.24): every data statement a migration runs on a walled table (one with FORCE
// ROW LEVEL SECURITY from an earlier statement) runs with FORCE lifted inside its own DO statement for a runner that is
// neither superuser nor BYPASSRLS (RDS's admin, the tables' owner): such a runner otherwise reads and changes none of
// their rows and the migration still "succeeds" (breaker M1 on #3060).
//   Text: each such statement (UPDATE, INSERT, DELETE, SELECT, PERFORM, WITH; function and view bodies excluded) sits in a
//   DO block that names the table in an ARRAY literal, tests rolsuper OR rolbypassrls, lifts FORCE before it and puts it
//   back after it; the rule's own self-tests; every edited migration's checksum is written by the F7 migration.
//   Database (PostgreSQL 18): the walls the text says exist are exactly the forced tables of a migrated database; seeded
//   rows are changed by each data migration run as a non-BYPASSRLS owner, a data check still stops, and FORCE is back.
//   Limits of the text rule (none used by any migration today, reviewed on #3068): a data statement inside a function or
//   view the migration itself calls, a ';' or '--' inside a string literal before the table's name, a lift under IF false.
// Throwaway cluster (initdb; as the postgres user when run as root), removed at the end. US$0.
//   tsx studio/tests/check_pf8b_f7_data_walls.ts [port]     (default 15461; one port; PGBIN=<PostgreSQL 18 bin>)
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chownSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const STUDIO = join(import.meta.dirname, "..");
const MIG = join(STUDIO, "prisma", "migrations");
const F7 = "20261122050000_pf8b_f7_data_walls_checksums";
const PORT = Number(process.argv[2] ?? 15461);
let failed = 0, total = 0;
const check = (name: string, ok: boolean, got?: unknown) => { total++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `: ${JSON.stringify(got)}`}`); if (!ok) failed++; };

// ---------------------------------------------------------------------------------------------------------------- text
const blank = (s: string) => s.replace(/[^\n]/g, " ");
/** What runs when the migration runs: comments, function bodies and view bodies blanked (offsets kept). */
function runnable(sql: string): string {
  const s = sql.replace(/--[^\n]*/g, blank); let out = s;
  const fn = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/gi; let m: RegExpExecArray | null;
  while ((m = fn.exec(s))) {
    const d = /\$[A-Za-z0-9_]*\$/g; d.lastIndex = m.index; const open = d.exec(s); if (!open) break;
    const close = s.indexOf(open[0], open.index + open[0].length); const end = close < 0 ? s.length : close + open[0].length;
    out = out.slice(0, open.index) + blank(out.slice(open.index, end)) + out.slice(end); fn.lastIndex = end;
  }
  return out.replace(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW[^;]*;/gi, blank);
}
type Finding = { migration: string; table: string; statement: string };
/** Reviewed mentions that read no row of a walled table, each with its reason (anything else must be lifted). */
export const EXEMPT: { migration: string; table: string; text: RegExp; why: string }[] = [
  { migration: "20261116133000_fo7a2_ledger_rules", table: "money_credit_note", text: /FOREIGN KEY/i, why: "the key is on a column this migration adds, NULL in every existing row: nothing to validate" },
  { migration: "20261119080000_fo7ts_ledgers", table: "money_trust_entry", text: /FOREIGN KEY/i, why: "the key is on a column this migration adds, NULL in every existing row: nothing to validate" },
  { migration: "20261119031000_fo3a_hour_sets", table: "fo_availability", text: /FOREIGN KEY/i, why: "set_id was filled by this migration's lifted backfill just before, and is NOT NULL" },
  { migration: "20261119031000_fo3a_hour_sets", table: "fo_availability_set", text: /FOREIGN KEY/i, why: "the table was made empty by this migration and filled by its lifted backfill" },
];
const DDL = /^(?:ALTER|CREATE|DROP|GRANT|REVOKE|COMMENT|LOCK|REINDEX|ANALYZE|VACUUM|CLUSTER|DECLARE|FOREACH|SET|RESET|SECURITY|OWNER)\b/i;
const WRITE = /^(?:UPDATE|INSERT|DELETE|MERGE|TRUNCATE|COPY)\b/i;
/**
 * Walls in order, and every mention of a walled table that is data access (any statement that is not DDL, in any case,
 * in an EXECUTE string too; a foreign key or VALIDATE CONSTRAINT on an existing walled table) and is not inside a
 * lifting DO block. Function and view bodies run later, as their callers, and are not read.
 */
function audit(files: [string, string][]): { walled: Set<string>; unguarded: Finding[]; guarded: Finding[] } {
  const walled = new Set<string>(); const unguarded: Finding[] = []; const guarded: Finding[] = [];
  for (const [name, sql] of files) {
    const run = runnable(sql);
    const forcedAt: [string, number][] = [];
    for (const x of run.matchAll(/ALTER TABLE\s+(?:ONLY\s+)?"?(\w+)"?\s+(?:ENABLE ROW LEVEL SECURITY,\s*)?FORCE ROW LEVEL SECURITY/gi)) forcedAt.push([x[1].toLowerCase(), x.index!]);
    // DO blocks: [start, end, body]. One that sets FORCE over an ARRAY and never lifts it walls those tables (PF-12's loop).
    const blocks: [number, number, string][] = [];
    for (const d of run.matchAll(/\bDO\s+(\$\w*\$)/g)) { const e = run.indexOf(d[1], d.index! + d[0].length); if (e > 0) blocks.push([d.index!, e, run.slice(d.index!, e)]); }
    for (const [, e, body] of blocks) if (/'ALTER TABLE %I FORCE ROW LEVEL SECURITY'/.test(body) && !/NO FORCE ROW LEVEL SECURITY/.test(body))
      for (const a of body.matchAll(/ARRAY\[([\s\S]*?)\]/g)) for (const t of a[1].matchAll(/'(\w+)'/g)) forcedAt.push([t[1].toLowerCase(), e]);
    const tables = new Set([...walled, ...forcedAt.map(([t]) => t)]);
    for (const t of tables) for (const o of run.matchAll(new RegExp(`(?<![\\w$])"?${t}"?(?![\\w])`, "gi"))) {
      const at = o.index!;
      if (!walled.has(t) && !forcedAt.some(([w, p]) => w === t && p < at)) continue;   // not walled yet here
      const b = blocks.find(([bs, be]) => bs < at && at < be);
      if (b && at - b[0] < b[2].search(/\bBEGIN\b/)) continue;   // a DO block's DECLARE section (its walls array)
      // the statement around the mention: from the last ;, BEGIN, THEN, ELSE, LOOP or DO tag before it to the next ;
      const from = Math.max(b ? b[0] + b[2].indexOf("$", 3) + 1 : 0, ...[...run.slice(b ? b[0] : 0, at).matchAll(/;|\bBEGIN\b|\bTHEN\b|\bELSE\b|\bLOOP\b|\bDO\s+\$\w*\$/gi)].map((m) => (b ? b[0] : 0) + m.index! + m[0].length));
      const to = run.indexOf(";", at);
      const stmt = run.slice(from, to < 0 ? run.length : to).trim();
      const head = stmt.replace(/^(?:EXECUTE\s+(?:format\s*\(\s*)?(?:\$\w*\$|')\s*)/i, "");   // an EXECUTE's own SQL
      const fk = /^ALTER TABLE\s+(?:ONLY\s+)?"?(\w+)"?[\s\S]*(?:FOREIGN KEY|VALIDATE CONSTRAINT)/i.exec(head);
      if (fk ? fk[1].toLowerCase() !== t : DDL.test(head)) continue;   // DDL; a key's validation counts on its own table
      // a name inside a string literal is a value (an audit line's entity, a catalog pattern), unless the string is run
      const inString = ((run.slice(from, at).match(/'/g) ?? []).length % 2) === 1;
      if (inString && head === stmt) continue;
      const f: Finding = { migration: name, table: t, statement: stmt.replace(/\s+/g, " ").slice(0, 100) };
      if (EXEMPT.some((x) => x.migration === name && x.table === t && x.text.test(stmt))) continue;
      const ok = !!b && (() => {
        const [bs, , body] = b; const rel = at - bs;
        const decl = /\b(?:walls|four)\s+\w+\[\]\s*:=\s*ARRAY\[([^\]]*)\]/i.exec(body);
        const named = decl ? [...decl[1].matchAll(/'(\w+)'/g)].map((x) => x[1].toLowerCase()) : [];
        const lock = body.search(/IN ACCESS EXCLUSIVE MODE/), lift = body.search(/'ALTER TABLE %I NO FORCE ROW LEVEL SECURITY'/);
        const back = body.lastIndexOf("'ALTER TABLE %I FORCE ROW LEVEL SECURITY'");
        const gate = body.search(/DISABLE TRIGGER "0_pf12_firm_first"/), ungate = body.lastIndexOf('ENABLE TRIGGER "0_pf12_firm_first"');
        const when = /IF NOT \(SELECT \w+\.rolsuper OR \w+\.rolbypassrls FROM pg_roles/.test(body)   // the lift for the others only
          || /IF \(SELECT \w+\.rolsuper OR \w+\.rolbypassrls FROM pg_roles[^;]*\) THEN\s+LOCK TABLE[^;]*IN SHARE ROW EXCLUSIVE MODE;\s+ELSE/.test(body);   // pf18bk's form
        return when && /INTO \w+ FROM pg_class[\s\S]*relforcerowsecurity/.test(body) && lock >= 0 && lock < lift && lift < rel && back > rel && named.includes(t)
          && (!WRITE.test(head) || (gate >= 0 && gate < rel && ungate > rel));
      })();
      (ok ? guarded : unguarded).push(f);
    }
    for (const [t] of forcedAt) walled.add(t);
  }
  return { walled, unguarded, guarded };
}
const files: [string, string][] = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d) && existsSync(join(MIG, d, "migration.sql"))).sort()
  .map((d) => [d, readFileSync(join(MIG, d, "migration.sql"), "utf8")]);
const result = audit(files);
check(`every data statement on a walled table runs with FORCE lifted in its own DO statement (${result.guarded.length} guarded in ${new Set(result.guarded.map((g) => g.migration)).size} migrations)`,
  result.unguarded.length === 0, result.unguarded);
// the rule itself, on made-up migrations
const WALL = ["0_walls", `CREATE TABLE "w" (id int); ALTER TABLE "w" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;`] as [string, string];
const lift = (inner: string, walls = "'w'", back = true, gate = true) => `DO $x$\nDECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY[${walls}];\nBEGIN\n  IF NOT (SELECT q.rolsuper OR q.rolbypassrls FROM pg_roles q WHERE q.rolname = current_user) THEN\n    EXECUTE 'LOCK TABLE w IN ACCESS EXCLUSIVE MODE';\n    SELECT coalesce(array_agg(c.relname::text), '{}') INTO lifted FROM pg_class c WHERE c.relname = ANY (walls) AND c.relforcerowsecurity;\n    FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;\n${gate ? `    FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;\n` : ""}  END IF;\n  ${inner}\n${gate ? `  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;\n` : ""}  ${back ? "FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;" : ""}\nEND $x$;`;
const bad = (sql: string) => audit([WALL, ["1_data", sql]]).unguarded.length > 0;
const flags: [string, string][] = [
  ["a bare UPDATE", `UPDATE "w" SET id = 1;`], ["a DO block without the lift", `DO $$ BEGIN UPDATE "w" SET id = 1; END $$;`],
  ["a lift naming another table", lift(`UPDATE "w" SET id = 1;`, "'v'")], ["a lift without the way back", lift(`UPDATE "w" SET id = 1;`, "'w'", false)],
  ["a blind count", `DO $$ DECLARE n int; BEGIN SELECT count(*) INTO n FROM "w"; END $$;`],
  ["a write with the firm gate left on", lift(`UPDATE "w" SET id = 1;`, "'w'", true, false)],
  ["IF EXISTS (SELECT …)", `DO $$ BEGIN IF EXISTS (SELECT 1 FROM "w") THEN RAISE 'x'; END IF; END $$;`],
  ["an assignment from a query", `DO $$ DECLARE n int; BEGIN n := (SELECT count(*) FROM w); END $$;`],
  ["IF (SELECT count(*) …) > 0", `DO $$ BEGIN IF (SELECT count(*) FROM w) > 0 THEN RAISE 'x'; END IF; END $$;`],
  ["EXIT WHEN NOT EXISTS", `DO $$ BEGIN LOOP EXIT WHEN NOT EXISTS (SELECT 1 FROM w); END LOOP; END $$;`],
  ["RAISE with a query", `DO $$ BEGIN RAISE NOTICE '%', (SELECT count(*) FROM w); END $$;`],
  ["EXECUTE of a string", `DO $$ BEGIN EXECUTE 'UPDATE w SET id = 1'; END $$;`],
  ["EXECUTE format with the name", `DO $$ BEGIN EXECUTE format('UPDATE %I SET id = 1', 'w'); END $$;`],
  ["MERGE", `MERGE INTO w USING (SELECT 1 AS id) s ON w.id = s.id WHEN MATCHED THEN DELETE;`],
  ["an unquoted mixed-case name", `update W set id = 1;`],
  ["a foreign key on an existing walled table", `ALTER TABLE "w" ADD CONSTRAINT k FOREIGN KEY (id) REFERENCES x(id);`],
  ["VALIDATE CONSTRAINT on it", `ALTER TABLE w VALIDATE CONSTRAINT k;`],
  ["a lift run for the superuser instead (inverted test)", lift(`UPDATE "w" SET id = 1;`).replace("IF NOT (SELECT", "IF (SELECT")],
  ["a lift whose list of forced tables is never filled", lift(`UPDATE "w" SET id = 1;`).replace(/    SELECT coalesce[^\n]*\n/, "")],
  ["a lift whose exclusive lock comes after it", lift(`UPDATE "w" SET id = 1;`).replace("    EXECUTE 'LOCK TABLE w IN ACCESS EXCLUSIVE MODE';\n", "").replace("  END IF;\n", "  END IF;\n  EXECUTE 'LOCK TABLE w IN ACCESS EXCLUSIVE MODE';\n")],
];
const missed = flags.filter(([, sql]) => !bad(sql)).map(([what]) => what);
check(`the rule flags each of ${flags.length} ways to read or write a walled table without the lift (${flags.map(([w]) => w).join("; ")})`, missed.length === 0, missed);
const passes: [string, boolean][] = [
  ["the lift", !bad(lift(`UPDATE "w" SET id = 1;`))],
  ["a statement before the wall exists", audit([["0", `UPDATE "w" SET id = 1; ALTER TABLE "w" FORCE ROW LEVEL SECURITY;`]]).unguarded.length === 0],
  ["a trigger function's body", !bad(`CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE "w" SET id = 1; RETURN NULL; END $$;`)],
  ["a read without the gate", !bad(lift(`SELECT count(*) INTO t FROM "w";`, "'w'", true, false))],
  ["DDL on the table", !bad(`ALTER TABLE "w" ADD COLUMN x int; CREATE INDEX i ON w (id); GRANT SELECT ON w TO PUBLIC;`)],
  ["a key referencing it from a new table", !bad(`ALTER TABLE "n" ADD CONSTRAINT k FOREIGN KEY (id) REFERENCES "w"(id);`)],
  ["a longer name that only starts with it", !bad(`DO $$ BEGIN PERFORM 1 FROM w_other; END $$;`)],
];
check(`…and passes ${passes.map(([w]) => w).join("; ")}`, passes.every(([, ok]) => ok), passes.filter(([, ok]) => !ok).map(([w]) => w));
// checksums of the migrations F7 edited (every one with an F7 lift)
const f7 = readFileSync(join(MIG, F7, "migration.sql"), "utf8");
// named, not found by a phrase: a later migration that copies the block, comments included, is not one F7 edited
const edited = ["20261116030000_fo7mv_move_list", "20261117030000_fo9a_duplicate_match", "20261118200000_fo7ts_money_settings",
  "20261118200100_fo7ts_card_terminal_trust", "20261119031000_fo3a_hour_sets", "20261119081500_fo3a_set_name_unique",
  "20261121090000_fo10p2_least_recent_turns", "20261121110000_fo3a1e_firm_timings", "20261122000000_pf5p3_billing_period",
  "20261122033000_qa644_reserve_staging"];
const missing = edited.filter((d) => { const h = createHash("sha256").update(readFileSync(join(MIG, d, "migration.sql"))).digest("hex");
  return !new RegExp(`SET checksum = '${h}'\\s+WHERE migration_name = '${d}' AND finished_at IS NOT NULL AND checksum <> '${h}'`).test(f7); });
check(`the ${edited.length} migrations F7 edited: each sha256 is the checksum ${F7} writes`, missing.length === 0, missing);

// ------------------------------------------------------------------------------------------------------------ database
const which = spawnSync("bash", ["-c", "command -v initdb"], { encoding: "utf8" }).stdout.trim();
const PGBIN = process.env.PGBIN ?? (existsSync("/usr/lib/postgresql/18/bin/initdb") ? "/usr/lib/postgresql/18/bin" : dirname(which || "/opt/homebrew/opt/postgresql@18/bin/initdb"));
const root = process.getuid?.() === 0;
const asPg = (cmd: string, args: string[]) => (root ? ["runuser", ["-u", "postgres", "--", cmd, ...args]] : [cmd, args]) as [string, string[]];
const dir = `/tmp/pf8b-f7-${PORT}`;
const psql = (user: string, sql: string, db: string) => spawnSync("psql", ["-h", "127.0.0.1", "-p", String(PORT), "-U", user, "-d", db, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
const q = (user: string, sql: string, db: string) => { const r = psql(user, sql, db); return (r.stdout + r.stderr).trim(); };
function start(): boolean {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  if (root) chownSync(dir, Number(execFileSync("id", ["-u", "postgres"], { encoding: "utf8" })), Number(execFileSync("id", ["-g", "postgres"], { encoding: "utf8" })));
  const init = asPg(join(PGBIN, "initdb"), ["-D", `${dir}/data`, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C.UTF-8"]);
  if (spawnSync(init[0], init[1], { stdio: "ignore" }).status !== 0) return false;
  const run = asPg(join(PGBIN, "pg_ctl"), ["-D", `${dir}/data`, "-o", `-p ${PORT} -k ${dir} -c listen_addresses=127.0.0.1 -c log_error_verbosity=terse -c shared_buffers=16MB -c max_connections=40`, "-l", `${dir}/log`, "-w", "start"]);
  if (spawnSync(run[0], run[1], { stdio: "ignore" }).status !== 0) return false;
  for (const s of ["CREATE ROLE rds_superuser NOLOGIN", "CREATE ROLE xr_admin LOGIN CREATEROLE CREATEDB NOSUPERUSER BYPASSRLS", "GRANT rds_superuser TO xr_admin WITH ADMIN OPTION"])
    if (psql("postgres", s, "postgres").status !== 0) return false;
  return true;
}
function stop() { const s = asPg(join(PGBIN, "pg_ctl"), ["-D", `${dir}/data`, "stop", "-m", "fast"]); spawnSync(s[0], s[1], { stdio: "ignore" }); rmSync(dir, { recursive: true, force: true }); }
/** Deploy every migration, or only those up to and including `upTo`, through a copy of prisma/ with its own config. */
function migrate(db: string, upTo?: string) {
  let config: string[] = [];
  if (upTo) {
    const t = join(dir, `prisma-${db}-${upTo.slice(0, 14)}`); rmSync(t, { recursive: true, force: true }); mkdirSync(join(t, "migrations"), { recursive: true });
    cpSync(join(STUDIO, "prisma", "schema"), join(t, "schema"), { recursive: true });
    for (const m of readdirSync(MIG)) if (m === "migration_lock.toml" || m <= upTo) cpSync(join(MIG, m), join(t, "migrations", m), { recursive: true });
    writeFileSync(join(t, "prisma.config.mjs"), `export default { schema: ${JSON.stringify(join(t, "schema"))}, migrations: { path: ${JSON.stringify(join(t, "migrations"))} }, datasource: { url: process.env.DATABASE_URL } };\n`);
    config = ["--config", join(t, "prisma.config.mjs")];
  }
  return spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "deploy", ...config],
    { cwd: STUDIO, encoding: "utf8", timeout: 600_000, env: { ...process.env, DATABASE_URL: `postgresql://xr_admin@127.0.0.1:${PORT}/${db}` } });
}
const out = (m: ReturnType<typeof migrate>) => (m.stdout + m.stderr).match(/(P30\d\d|PF-|QA-|ERROR|message)[^\n]*/g)?.slice(0, 3);
const before = (d: string) => files.map(([n]) => n).filter((n) => n < d).pop()!;
const bypass = (on: boolean) => psql("postgres", `ALTER ROLE xr_admin ${on ? "BYPASSRLS" : "NOBYPASSRLS"}`, "postgres").status === 0;
const seed = (db: string, sql: string) => q("postgres", `SET session_replication_role = replica; ${sql}`, db);   // past triggers, keys and walls
const forcedInDb = (db: string) => q("postgres", "select string_agg(relname, ',' order by relname) from pg_class where relforcerowsecurity and relnamespace = 'public'::regnamespace", db);
const FIRM = "11111111-1111-1111-1111-111111111111", STAFF = "22222222-2222-2222-2222-222222222222";
// a firm and one of its staff, as real rows (the hour sets' key needs the staff row)
const FIRM_ROWS = `INSERT INTO platform_firm (id, key, operating_name, country_code, contact_email, updated_at) VALUES ('${FIRM}', 'f7-a', 'Firm A', 'CA', 'a@example.test', now());
  INSERT INTO platform_staff (id, firm_id, email, display_name, updated_at) VALUES ('${STAFF}', '${FIRM}', 's@example.test', 'Staff S', now())`;
process.on("exit", stop);

// each window: everything before M deployed with BYPASSRLS, rows seeded, then M alone run by the admin without BYPASSRLS
const windows: { m: string; tbl: string; seedSql: string; want: string; got: string; what: string }[] = [
  { m: "20261117030000_fo9a_duplicate_match", tbl: "fo_person", what: "fo9a fills a hidden person's name key",
    seedSql: `${FIRM_ROWS}; INSERT INTO fo_person (id, firm_id, given_names, family_name, created_by, updated_at) VALUES (gen_random_uuid(), '${FIRM}', 'Ada', 'Lovelace', 'test', now())`,
    got: "select count(*) from fo_person where name_key is not null", want: "1" },
  { m: "20261119031000_fo3a_hour_sets", tbl: "fo_availability", what: "fo3a gives a hidden staff member's hours their default set",
    seedSql: `INSERT INTO fo_availability (id, firm_id, staff_id, weekday, start_minute, end_minute, time_zone) VALUES (gen_random_uuid(), '${FIRM}', '${STAFF}', 1, 540, 1020, 'America/Toronto')`,
    got: "select (select count(*) from fo_availability_set) || ',' || (select count(*) from fo_availability where set_id is not null)", want: "1,1" },
  { m: "20261119081500_fo3a_set_name_unique", tbl: "fo_availability_set", what: "fo3a_set_name_unique renames a hidden duplicate set name",
    seedSql: `INSERT INTO fo_availability_set (id, firm_id, staff_id, name, is_default, time_zone) VALUES (gen_random_uuid(), '${FIRM}', '${STAFF}', 'Normal hours', false, 'America/Toronto')`,
    got: "select string_agg(name, ',' order by name) from fo_availability_set", want: "Normal hours,Normal hours (2)" },
  { m: "20261121090000_fo10p2_least_recent_turns", tbl: "fo_assignment_rule", what: "fo10p2 carries over a hidden rule's turn",
    seedSql: `INSERT INTO fo_assignment_rule (id, firm_id, criteria_key, strategy, eligible_staff_ids, created_by, updated_by, last_staff_id) VALUES (gen_random_uuid(), '${FIRM}', 'ANY:ANY', 'ROUND_ROBIN', ARRAY['${STAFF}']::uuid[], 'system:test', 'system:test', '${STAFF}')`,
    got: "select count(*) from fo_assignment_rule where turn_no = 1", want: "1" },
  { m: "20261121110000_fo3a1e_firm_timings", tbl: "fo_consultation_type", what: "fo3a1e moves a hidden booking type's default timings to the firm",
    seedSql: `INSERT INTO fo_consultation_type (id, firm_id, slug, name, minutes, updated_at, host_staff_ids, modes, gap_before_minutes, gap_after_minutes, min_notice_minutes, window_days, self_service_limit_minutes) VALUES (gen_random_uuid(), '${FIRM}', 's', 'S', 30, now(), ARRAY['${STAFF}']::uuid[], ARRAY['VIDEO']::"FoMeetingMode"[], 0, 10, 240, 60, 240)`,
    got: "select count(*) from fo_consultation_type where gap_before_minutes is null and gap_after_minutes is null and min_notice_minutes is null and window_days is null and self_service_limit_minutes is null", want: "1" },
  { m: "20261122000000_pf5p3_billing_period", tbl: "platform_subscription", what: "pf5p3 marks a hidden yearly subscription yearly",
    seedSql: `INSERT INTO platform_subscription (id, firm_id, plan_id, updated_at) VALUES ('33333333-3333-3333-3333-333333333333', '${FIRM}', gen_random_uuid(), now());
      INSERT INTO workspace (id, key, label) VALUES ('44444444-4444-4444-4444-444444444444', 'f7-audit', 'f7');
      INSERT INTO audit_event (id, workspace_id, firm_id, actor, actor_type, action, entity, entity_key, summary, detail) VALUES (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '${FIRM}', 'system:test', 'SYSTEM', 'platform.subscription.created', 'platform_subscription', '33333333-3333-3333-3333-333333333333', 's', '{"period":"YEARLY"}')`,
    got: "select billing_period from platform_subscription", want: "YEARLY" },
  { m: "20261123030000_pf19c_platform_starters", tbl: "msg_template", what: "pf19c seeds the three lead starters as platform templates beside a firm's hidden one",
    seedSql: `INSERT INTO msg_firm (firm_id) VALUES ('${FIRM}') ON CONFLICT DO NOTHING;
      INSERT INTO msg_template (id, firm_id, owner, key, kind, channel, language, updated_at) VALUES (gen_random_uuid(), '${FIRM}', 'FIRM', 'f7.own', 'library', 'EMAIL', 'en', now())`,
    got: "select (select count(*) from msg_template where firm_id is null and key like 'sales.lead.%') || '|' || (select count(*) from msg_template_version where firm_id is null and published_by = 'seed:sa05-a1')", want: "3|3" },
];

try {
  if (!start()) { check("cluster started", false, PGBIN); throw new Error("no cluster"); }
  check("PostgreSQL 18", /^18\./.test(q("postgres", "show server_version", "postgres")), q("postgres", "show server_version", "postgres"));
  // the walls the text knows are the database's
  psql("postgres", "CREATE DATABASE xr_full OWNER xr_admin", "postgres");
  let m = migrate("xr_full");
  check("every migration applies from empty (BYPASSRLS admin, as CI's runners see every row)", m.status === 0, out(m));
  const parsed = [...result.walled].sort().join(",");
  check(`the walls the text finds are exactly the database's forced tables (${result.walled.size})`, forcedInDb("xr_full") === parsed,
    { onlyText: [...result.walled].filter((t) => !forcedInDb("xr_full").split(",").includes(t)), onlyDb: forcedInDb("xr_full").split(",").filter((t) => !result.walled.has(t)) });

  // the data migrations, one window each, on one database in order
  psql("postgres", "CREATE DATABASE xr_w OWNER xr_admin", "postgres");
  for (const w of windows) {
    bypass(true); m = migrate("xr_w", before(w.m));
    if (m.status !== 0) { check(`${w.m}: the migrations before it apply`, false, out(m)); break; }
    const s = seed("xr_w", w.seedSql);
    bypass(false);
    const hidden = q("xr_admin", `select count(*) from ${w.tbl}`, "xr_w") === "0" && q("postgres", `select count(*) from ${w.tbl}`, "xr_w") !== "0";
    m = migrate("xr_w", w.m);
    check(`${w.what}, run by an owner that is neither superuser nor BYPASSRLS, from whom ${w.tbl}'s rows are hidden`,
      hidden && m.status === 0 && q("postgres", w.got, "xr_w") === w.want, { seed: s.slice(0, 200), deploy: out(m), got: q("postgres", w.got, "xr_w") });
  }
  bypass(true); m = migrate("xr_w"); bypass(false);
  check("…the rest applies too, and every walled table is forced again at the end", m.status === 0 && forcedInDb("xr_w") === parsed, out(m));

  // a data check before pf18bk (card terminal payments into trust) still stops on a hidden row
  psql("postgres", "CREATE DATABASE xr_t OWNER xr_admin", "postgres");
  bypass(true); m = migrate("xr_t", before("20261118200100_fo7ts_card_terminal_trust"));
  const ts = seed("xr_t", `${FIRM_ROWS}; INSERT INTO money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by, cleared) VALUES (gen_random_uuid(), '${FIRM}', 'CARD_TERMINAL', 100, 'CAD', 'TRUST', now(), 'f7-card-terminal-1', 'staff:test', true)`);
  bypass(false); m = migrate("xr_t", "20261118200100_fo7ts_card_terminal_trust");
  check("fo7ts's check stops on a hidden card terminal payment into trust (FO-7ts message), money_payment still forced",
    m.status !== 0 && /FO-7ts: payment .* is a card terminal payment received into trust/.test(m.stdout + m.stderr)
      && q("postgres", "select relforcerowsecurity from pg_class where relname = 'money_payment'", "xr_t") === "t", { seed: ts.slice(0, 300), deploy: out(m) });

  // a data check (qa644) still stops when the row it looks for is hidden; FORCE is back after the rollback
  psql("postgres", "CREATE DATABASE xr_c OWNER xr_admin", "postgres");
  bypass(true); m = migrate("xr_c", before("20261122033000_qa644_reserve_staging"));
  const cs = seed("xr_c", `${FIRM_ROWS}; INSERT INTO platform_firm_web_address (firm_id, address, set_by, updated_at) VALUES ('${FIRM}', 'staging', 'system:test', now())`);
  bypass(false); m = migrate("xr_c", "20261122033000_qa644_reserve_staging");
  check("qa644's check stops on a firm holding the address staging, hidden from the admin (QA-644 message)", m.status !== 0 && /QA-644: the web address staging/.test(m.stdout + m.stderr), { seed: cs.slice(0, 300), deploy: out(m) });
  check("…and the two address tables are still forced (the statement rolled back)",
    q("postgres", "select string_agg(relname || ':' || relforcerowsecurity, ',' order by relname) from pg_class where relname in ('platform_firm_address_history', 'platform_firm_web_address')", "xr_c")
      === "platform_firm_address_history:true,platform_firm_web_address:true");
} catch (e) { if (!failed) check("ran", false, String(e)); }

console.log(failed ? `${failed} failed` : `${total}/${total} passed`);
process.exit(failed ? 1 : 0);
