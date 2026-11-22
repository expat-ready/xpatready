// PF-8b F6 (Amazon RDS; R1.13, R1.15, R1.5, R1.24): every migration applies on PostgreSQL 18 as a role that is NEITHER
// superuser NOR BYPASSRLS (RDS's admin, which is not given BYPASSRLS), with `prisma migrate deploy` exiting 0, and
// 20261119170000_pf18bk_support_keys still refuses an orphan support row there that row-level security hides from the
// admin: as the four tables' owner it lifts FORCE inside its one statement, counts with the same message as before, and
// puts FORCE back. (Letting ADD CONSTRAINT validate alone was tried first: on PostgreSQL 18 the owner's first validation
// reads under FORCE ROW LEVEL SECURITY and let all three keys in over a hidden orphan.) A BYPASSRLS runner is unchanged. The RDS state is reproduced as the AWS proof left it
// (22 Nov): every migration before pf18bk applied (PF-12 makes two BYPASSRLS roles, which vanilla PostgreSQL lets only a
// BYPASSRLS role do; RDS let its admin), so those run with BYPASSRLS, the cluster superuser then takes BYPASSRLS away
// from the admin, and the rest are deployed. Throwaway clusters (initdb; as the postgres user when run as root),
// removed at the end. US$0.
//   tsx studio/tests/check_pf8b_f6_pg18_nobypass.ts [port]     (default 15441; uses port..port+1; PGBIN=<PostgreSQL 18 bin>)
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chownSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const STUDIO = join(import.meta.dirname, "..");
const MIG = join(STUDIO, "prisma", "migrations");
const PF18BK = "20261119170000_pf18bk_support_keys";
const PORT = Number(process.argv[2] ?? 15441);
const which = spawnSync("bash", ["-c", "command -v initdb"], { encoding: "utf8" }).stdout.trim();
const PGBIN = process.env.PGBIN ?? (existsSync("/usr/lib/postgresql/18/bin/initdb") ? "/usr/lib/postgresql/18/bin" : dirname(which || "/opt/homebrew/opt/postgresql@18/bin/initdb"));
const root = process.getuid?.() === 0;
const asPg = (cmd: string, args: string[]) => (root ? ["runuser", ["-u", "postgres", "--", cmd, ...args]] : [cmd, args]) as [string, string[]];
let failed = 0, total = 0;
const check = (name: string, ok: boolean, got?: unknown) => { total++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `: ${JSON.stringify(got)}`}`); if (!ok) failed++; };

// --- the text: pf18bk's checksum is written by the F6 migration; the counts stay for a superuser or BYPASSRLS runner
const pf18bk = readFileSync(join(MIG, PF18BK, "migration.sql"), "utf8");
const sha = createHash("sha256").update(readFileSync(join(MIG, PF18BK, "migration.sql"))).digest("hex");
const f6 = readFileSync(join(MIG, "20261122040000_pf8b_f6_pf18bk_checksum", "migration.sql"), "utf8");
check(`${PF18BK}: its sha256 is the checksum 20261122040000_pf8b_f6_pf18bk_checksum writes (edit it only with that line)`,
  new RegExp(`SET checksum = '${sha}'\\s+WHERE migration_name = '${PF18BK}' AND finished_at IS NOT NULL AND checksum <> '${sha}'`).test(f6), sha);
// the counts run for every runner, after FORCE is lifted for a non-BYPASSRLS owner, and FORCE comes back after the keys
const countsKept = (text: string) => /IF \(SELECT r\.rolsuper OR r\.rolbypassrls FROM pg_roles r WHERE r\.rolname = current_user\) THEN\s+LOCK TABLE[^;]*IN SHARE ROW EXCLUSIVE MODE;\s+ELSE[\s\S]*?RAISE EXCEPTION 'PF-18bk stopped, nothing changed: % cannot see[\s\S]*?END IF;\s+LOCK TABLE[^;]*IN ACCESS EXCLUSIVE MODE;[\s\S]*?NO FORCE ROW LEVEL SECURITY[\s\S]*?END IF;\s+SELECT count\(\*\) INTO no_firm[\s\S]*RAISE EXCEPTION 'PF-18bk stopped, nothing changed: % support ticket[\s\S]*ADD CONSTRAINT "platform_support_message_firm_id_fkey"[\s\S]*FOREACH t IN ARRAY forced LOOP EXECUTE format\('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t\)/.test(text.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"));
check("pf18bk: every runner gets the orphan counts and their message; a non-BYPASSRLS owner lifts FORCE first and puts it back after the keys", countsKept(pf18bk));
check("…and that rule catches the counts skipped for a non-BYPASSRLS runner, or FORCE not put back",
  !countsKept(pf18bk.replace(/END IF;\n  SELECT count\(\*\) INTO no_firm/, "ELSE\n  SELECT count(*) INTO no_firm")) && !countsKept(pf18bk.replace("'ALTER TABLE %I FORCE ROW LEVEL SECURITY'", "'SELECT 1'")));

// --- clusters
const dir = (p: number) => `/tmp/pf8b-f6-${p}`;
const psql = (p: number, user: string, sql: string, db: string) =>
  spawnSync("psql", ["-h", "127.0.0.1", "-p", String(p), "-U", user, "-d", db, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
const q = (p: number, user: string, sql: string, db: string) => { const r = psql(p, user, sql, db); return (r.stdout + r.stderr).trim(); };
function start(p: number): boolean {
  const d = dir(p); rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true });
  if (root) chownSync(d, Number(execFileSync("id", ["-u", "postgres"], { encoding: "utf8" })), Number(execFileSync("id", ["-g", "postgres"], { encoding: "utf8" })));
  const init = asPg(join(PGBIN, "initdb"), ["-D", `${d}/data`, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C.UTF-8"]);
  if (spawnSync(init[0], init[1], { stdio: "ignore" }).status !== 0) return false;
  const o = `-p ${p} -k ${d} -c listen_addresses=127.0.0.1 -c log_error_verbosity=terse -c shared_buffers=16MB -c max_connections=40`;
  const run = asPg(join(PGBIN, "pg_ctl"), ["-D", `${d}/data`, "-o", o, "-l", `${d}/log`, "-w", "start"]);
  if (spawnSync(run[0], run[1], { stdio: "ignore" }).status !== 0) return false;
  for (const s of ["CREATE ROLE rds_superuser NOLOGIN", "CREATE ROLE xr_admin LOGIN CREATEROLE CREATEDB NOSUPERUSER BYPASSRLS",
    "GRANT rds_superuser TO xr_admin WITH ADMIN OPTION"]) if (psql(p, "postgres", s, "postgres").status !== 0) return false;
  return true;
}
function stop(p: number) { const s = asPg(join(PGBIN, "pg_ctl"), ["-D", `${dir(p)}/data`, "stop", "-m", "fast"]); spawnSync(s[0], s[1], { stdio: "ignore" }); rmSync(dir(p), { recursive: true, force: true }); }
const adminBypass = (p: number, on: boolean) => psql(p, "postgres", `ALTER ROLE xr_admin ${on ? "BYPASSRLS" : "NOBYPASSRLS"}`, "postgres").status === 0;
const newDb = (p: number, db: string) => psql(p, "postgres", `CREATE DATABASE ${db} OWNER xr_admin`, "postgres").status === 0;
// every migration, or (before) only those older than pf18bk: a copy of prisma/ with its own config
function migrate(p: number, db: string, before?: string) {
  let config: string[] = [];
  if (before) {
    const t = join(dir(p), `prisma-${db}`); rmSync(t, { recursive: true, force: true }); mkdirSync(join(t, "migrations"), { recursive: true });
    cpSync(join(STUDIO, "prisma", "schema"), join(t, "schema"), { recursive: true });
    for (const m of readdirSync(MIG)) if (m === "migration_lock.toml" || m < before) cpSync(join(MIG, m), join(t, "migrations", m), { recursive: true });
    writeFileSync(join(t, "prisma.config.mjs"), `export default { schema: ${JSON.stringify(join(t, "schema"))}, migrations: { path: ${JSON.stringify(join(t, "migrations"))} }, datasource: { url: process.env.DATABASE_URL } };\n`);
    config = ["--config", join(t, "prisma.config.mjs")];
  }
  return spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "deploy", ...config],
    { cwd: STUDIO, encoding: "utf8", timeout: 600_000, env: { ...process.env, DATABASE_URL: `postgresql://xr_admin@127.0.0.1:${p}/${db}` } });
}
const out = (m: ReturnType<typeof migrate>) => (m.stdout + m.stderr).match(/(P30\d\d|42501|23503|PF-18bk|violates|stopped)[^\n]*/g)?.slice(0, 3);
const keys = (p: number, db: string) => q(p, "xr_admin", "select count(*) from pg_constraint where conname in ('platform_support_ticket_firm_id_fkey','platform_support_ticket_firm_id_raised_by_fkey','platform_support_message_firm_id_fkey')", db);
// an orphan written as the cluster superuser, past the write trigger (session_replication_role) and the walls
const orphan = (p: number, db: string, sql: string) => q(p, "postgres", `SET session_replication_role = replica; ${sql}`, db);
const FOUR = "select string_agg(relname || ':' || relrowsecurity || relforcerowsecurity, ',' order by relname) from pg_class where relname in ('platform_firm','platform_staff','platform_support_ticket','platform_support_message') and relkind = 'r'";
const forcedAll = (p: number, db: string) => q(p, "postgres", FOUR, db) === "platform_firm:truetrue,platform_staff:truetrue,platform_support_message:truetrue,platform_support_ticket:truetrue";
const FIRM = "11111111-1111-1111-1111-111111111111";
const ports = [PORT, PORT + 1];
process.on("exit", () => ports.forEach(stop));

try {
  if (!start(PORT)) { check("cluster started", false, PGBIN); throw new Error("no cluster"); }
  check("PostgreSQL 18", /^18\./.test(q(PORT, "postgres", "show server_version", "postgres")), q(PORT, "postgres", "show server_version", "postgres"));
  // the RDS state: every migration before pf18bk applied (the databases are made first; the admin then loses BYPASSRLS)
  const dbs = ["xr_a", "xr_b0", "xr_b1", "xr_b2", "xr_d"];
  for (const db of dbs) { newDb(PORT, db); const m = migrate(PORT, db, PF18BK); check(`${db}: the migrations before pf18bk apply (as on RDS)`, m.status === 0, out(m)); }
  adminBypass(PORT, false);
  check("the migrating user is now neither superuser nor BYPASSRLS, and has CREATEROLE (RDS's admin, not given BYPASSRLS)",
    q(PORT, "xr_admin", "select rolsuper||','||rolbypassrls||','||rolcreaterole from pg_roles where rolname = current_user", "postgres") === "false,false,true");

  // A — the rest applies (over one firm the admin cannot see: review m4)
  orphan(PORT, "xr_a", `INSERT INTO platform_firm (id, key, operating_name, country_code, contact_email, updated_at) VALUES ('${FIRM}', 'f6-a', 'Firm A', 'CA', 'a@example.test', now())`);
  let m = migrate(PORT, "xr_a");
  check("A: pf18bk and every later migration apply: prisma migrate deploy exits 0 (main: P3018 / 42501 at pf18bk)", m.status === 0, out(m));
  check("A: pf18bk's three keys are in place", keys(PORT, "xr_a") === "3", keys(PORT, "xr_a"));
  check("A: the four tables keep ENABLE and FORCE ROW LEVEL SECURITY (the walls as they were)", forcedAll(PORT, "xr_a"), q(PORT, "postgres", FOUR, "xr_a"));
  // the walls after the lift: xr_app reads no firm without a session firm, only its own with one (the superuser sees it)
  check("A: after pf18bk the walls hold: xr_app reads no firm with no session firm, firm A only as firm A",
    q(PORT, "xr_app", "select count(*) from platform_firm", "xr_a") === "0"
    && q(PORT, "xr_app", `select set_config('app.firm_id','${FIRM}',false); select count(*) from platform_firm`, "xr_a").split("\n").pop() === "1"
    && q(PORT, "postgres", "select count(*) from platform_firm", "xr_a") === "1",
    [q(PORT, "xr_app", "select count(*) from platform_firm", "xr_a"), q(PORT, "postgres", "select count(*) from platform_firm", "xr_a")]);
  check("A: prisma migrate status is clean (pf18bk's checksum is the file's)", /Database schema is up to date/.test(spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "status"],
    { cwd: STUDIO, encoding: "utf8", env: { ...process.env, DATABASE_URL: `postgresql://xr_admin@127.0.0.1:${PORT}/xr_a` } }).stdout));

  // B — orphans the admin cannot see (row-level security, forced) still stop pf18bk, and nothing is changed
  const cases: [string, string, string][] = [
    ["a support ticket without its firm", `INSERT INTO platform_support_ticket (id, firm_id, raised_by, page, updated_at) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '/x', now())`, "platform_support_ticket_firm_id_fkey"],
    ["a support ticket whose raiser is not on its firm's staff", `INSERT INTO platform_firm (id, key, operating_name, country_code, contact_email, updated_at) VALUES ('${FIRM}', 'f6-a', 'Firm A', 'CA', 'a@example.test', now()); INSERT INTO platform_support_ticket (id, firm_id, raised_by, page, updated_at) VALUES (gen_random_uuid(), '${FIRM}', gen_random_uuid(), '/x', now())`, "platform_support_ticket_firm_id_raised_by_fkey"],
    ["a support message without its firm", `INSERT INTO platform_support_message (id, firm_id, ticket_id, author_kind, author_id, body) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'SUPPORT', 'support', 'x')`, "platform_support_message_firm_id_fkey"],
  ];
  const rows = "select (select count(*) from platform_support_ticket) + (select count(*) from platform_support_message)";
  const msgs = ["1 support ticket(s) without their firm, 1 without a raiser on that firm's staff, 0 support message(s)",
    "0 support ticket(s) without their firm, 1 without a raiser on that firm's staff, 0 support message(s)",
    "0 support ticket(s) without their firm, 0 without a raiser on that firm's staff, 1 support message(s)"].map((t) => `PF-18bk stopped, nothing changed: ${t}`);
  for (const [i, [what, sql, key]] of cases.entries()) {
    const msg = msgs[i];
    const db = `xr_b${i}`;
    const w = orphan(PORT, db, sql);
    check(`B${i}: ${what} is in the table, hidden from the admin by row-level security`,
      !/ERROR/.test(w) && q(PORT, "postgres", rows, db) === "1" && q(PORT, "xr_admin", rows, db) === "0", w);
    m = migrate(PORT, db);
    check(`B${i}: ${what} stops pf18bk with its counts (${key}): '${msg}'`, m.status !== 0 && (m.stdout + m.stderr).includes(msg), out(m));
    check(`B${i}: …and changes nothing (no key, the row as it was, pf18bk not applied)`,
      keys(PORT, db) === "0" && q(PORT, "postgres", rows, db) === "1" && forcedAll(PORT, db)
      && q(PORT, "postgres", `select count(*) from _prisma_migrations where migration_name = '${PF18BK}' and finished_at is not null`, db) === "0", keys(PORT, db));
  }

  // D — only the tables that had FORCE get it back (review m4): platform_staff without FORCE stays without it
  q(PORT, "postgres", "ALTER TABLE platform_staff NO FORCE ROW LEVEL SECURITY", "xr_d");
  m = migrate(PORT, "xr_d");
  check("D: with platform_staff not forced, pf18bk applies and leaves it not forced; the other three forced",
    m.status === 0 && keys(PORT, "xr_d") === "3" && q(PORT, "postgres", FOUR, "xr_d") === "platform_firm:truetrue,platform_staff:truefalse,platform_support_message:truetrue,platform_support_ticket:truetrue",
    [out(m), q(PORT, "postgres", FOUR, "xr_d")]);

  // C — a BYPASSRLS admin keeps pf18bk's own counts and message (the guard as it was)
  if (!start(PORT + 1)) { check("cluster C started", false); throw new Error("no cluster"); }
  newDb(PORT + 1, "xr_c"); migrate(PORT + 1, "xr_c", PF18BK);
  orphan(PORT + 1, "xr_c", cases[0][1]);
  m = migrate(PORT + 1, "xr_c");
  check("C: a BYPASSRLS admin still gets pf18bk's counts: 'PF-18bk stopped, nothing changed: 1 support ticket(s) without their firm'",
    m.status !== 0 && /PF-18bk stopped, nothing changed: 1 support ticket\(s\) without their firm/.test(m.stdout + m.stderr), out(m));
} catch (e) { if (!failed) check("ran", false, String(e)); }

console.log(failed ? `${failed} failed` : `${total}/${total} passed`);
process.exit(failed ? 1 : 0);
