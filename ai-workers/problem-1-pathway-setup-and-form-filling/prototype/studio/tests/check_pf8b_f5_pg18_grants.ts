// PF-8b F5 (RDS 18.3; R1.13, R1.15, R1.5, R1.24): every migration applies on PostgreSQL 18 as a NON-superuser role with
// CREATEROLE, CREATEDB and BYPASSRLS, a member of rds_superuser (the Amazon RDS master's shape), with `prisma migrate
// deploy` exiting 0, and PF-12's two reader grants never go both ways (no membership loop, P3018 / 0LP01).
// Vanilla PostgreSQL refuses a non-superuser's GRANT of its own role, which RDS 18.3 accepted (AWS proof, 22 Nov), so
// shape B writes the membership that accepted grant makes (xr_admin in xr_wall_reader, granted by xr_admin) into the
// catalog before migrating, as the cluster superuser: on main that gave the exact RDS failure ("role xr_wall_reader is a
// member of role xr_admin"). Shape C: a reader that also holds something on the cluster stops PF-12 with its message.
// Throwaway clusters on their own ports (initdb; as the postgres user when run as root), removed at the end. US$0.
//   tsx studio/tests/check_pf8b_f5_pg18_grants.ts [port]     (default 15421; uses port..port+2; PGBIN=<PostgreSQL 18 bin>)
import { execFileSync, spawnSync } from "node:child_process";
import { chownSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const STUDIO = join(import.meta.dirname, "..");
const PORT = Number(process.argv[2] ?? 15421);
const which = spawnSync("bash", ["-c", "command -v initdb"], { encoding: "utf8" }).stdout.trim();
const PGBIN = process.env.PGBIN ?? (existsSync("/usr/lib/postgresql/18/bin/initdb") ? "/usr/lib/postgresql/18/bin" : dirname(which || "/opt/homebrew/opt/postgresql@18/bin/initdb"));
const root = process.getuid?.() === 0;
const asPg = (cmd: string, args: string[]) => (root ? ["runuser", ["-u", "postgres", "--", cmd, ...args]] : [cmd, args]) as [string, string[]];
let failed = 0, total = 0;
const check = (name: string, ok: boolean, got?: unknown) => { total++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `: ${JSON.stringify(got)}`}`); if (!ok) failed++; };

const dir = (p: number) => `/tmp/pf8b-f5-${p}`;
const psql = (p: number, user: string, sql: string, db = "xr_rds") =>
  spawnSync("psql", ["-h", "127.0.0.1", "-p", String(p), "-U", user, "-d", db, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
const q = (p: number, user: string, sql: string, db = "xr_rds") => { const r = psql(p, user, sql, db); return (r.stdout + r.stderr).trim(); };
function start(p: number): boolean {
  const d = dir(p); rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true });
  if (root) chownSync(d, Number(execFileSync("id", ["-u", "postgres"], { encoding: "utf8" })), Number(execFileSync("id", ["-g", "postgres"], { encoding: "utf8" })));
  const init = asPg(join(PGBIN, "initdb"), ["-D", `${d}/data`, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C.UTF-8"]);
  if (spawnSync(init[0], init[1], { stdio: "ignore" }).status !== 0) return false;
  const o = `-p ${p} -k ${d} -c listen_addresses=127.0.0.1 -c log_error_verbosity=terse -c shared_buffers=16MB -c max_connections=40`;
  const run = asPg(join(PGBIN, "pg_ctl"), ["-D", `${d}/data`, "-o", o, "-l", `${d}/log`, "-w", "start"]);
  if (spawnSync(run[0], run[1], { stdio: "ignore" }).status !== 0) return false;
  for (const s of ["CREATE ROLE rds_superuser NOLOGIN", "CREATE ROLE xr_admin LOGIN CREATEROLE CREATEDB BYPASSRLS NOSUPERUSER",
    "GRANT rds_superuser TO xr_admin WITH ADMIN OPTION", "CREATE DATABASE xr_rds OWNER xr_admin"])
    if (psql(p, "postgres", s, "postgres").status !== 0) return false;
  return true;
}
function stop(p: number) { const s = asPg(join(PGBIN, "pg_ctl"), ["-D", `${dir(p)}/data`, "stop", "-m", "fast"]); spawnSync(s[0], s[1], { stdio: "ignore" }); rmSync(dir(p), { recursive: true, force: true }); }
const migrate = (p: number) => spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "deploy"],
  { cwd: STUDIO, encoding: "utf8", timeout: 600_000, env: { ...process.env, DATABASE_URL: `postgresql://xr_admin@127.0.0.1:${p}/xr_rds` } });
// the membership RDS 18.3's accepted GRANT xr_admin TO xr_wall_reader makes: vanilla refuses it (and its loop check), so a
// stand-in grant is made and re-pointed in the catalog by the cluster superuser (grantor xr_admin, INHERIT TRUE, SET FALSE)
const rdsAcceptedGrant = (p: number) => q(p, "postgres", "CREATE ROLE f5_stand_in NOLOGIN; GRANT f5_stand_in TO xr_wall_reader WITH INHERIT TRUE, SET FALSE; "
  + "UPDATE pg_auth_members SET roleid = 'xr_admin'::regrole, grantor = 'xr_admin'::regrole WHERE roleid = 'f5_stand_in'::regrole AND member = 'xr_wall_reader'::regrole; DROP ROLE f5_stand_in", "postgres");
const loopFree = (p: number) => q(p, "xr_admin", "select pg_has_role('xr_admin','xr_wall_reader','SET')||','||pg_has_role('xr_admin','xr_wall_reader','USAGE')||','||"
  + "exists(select 1 from pg_auth_members where member = 'xr_wall_reader'::regrole and roleid = 'xr_admin'::regrole)");
const ports = [PORT, PORT + 1, PORT + 2];
process.on("exit", () => ports.forEach(stop));

// Static (review m1): vanilla PostgreSQL refuses line 91's grant from a non-superuser whatever pf12 says, so the cluster
// runs below cannot see the skip that fixes RDS. The text must keep it: the reader's grant of the migration role is
// raised into the fallback for every non-superuser (NOT su) and wherever the migration role already reaches the reader.
const PF12 = readFileSync(join(STUDIO, "prisma", "migrations", "20261116013000_pf12_firm_walls", "migration.sql"), "utf8");
const skipsForNonSuperuser = (text: string): boolean => {
  const sql = text.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  return /su boolean := \(SELECT rolsuper FROM pg_roles WHERE rolname = current_user\)/.test(sql)
    && /IF s = format\('GRANT %I TO xr_wall_reader WITH INHERIT TRUE, SET FALSE', current_user\)\s+AND \(NOT su OR EXISTS \(WITH RECURSIVE[\s\S]{0,400}?g\.rolname = 'xr_wall_reader'\)\) THEN\s+RAISE insufficient_privilege/.test(sql);
};
check("pf12: the reader's grant of the migration role is skipped for every non-superuser (the RDS 18.3 fix; vanilla cannot show it)", skipsForNonSuperuser(PF12));
check("…and that rule catches the skip removed (NOT su gone) or commented out",
  !skipsForNonSuperuser(PF12.replace("AND (NOT su OR EXISTS", "AND (false OR EXISTS")) && !skipsForNonSuperuser(PF12.replace(/^(\s*)(IF s = format\('GRANT %I TO xr_wall_reader)/m, "$1-- $2")));

try {
  // A — the RDS shape from empty
  if (!start(PORT)) { check("cluster A started", false, PGBIN); throw new Error("no cluster"); }
  check("PostgreSQL 18", /^18\./.test(q(PORT, "postgres", "show server_version", "postgres")), q(PORT, "postgres", "show server_version", "postgres"));
  check("A: the migrating user is not a superuser and has CREATEROLE (the RDS master's shape)",
    q(PORT, "xr_admin", "select rolsuper||','||rolcreaterole||','||rolbypassrls from pg_roles where rolname = current_user") === "false,true,true");
  let m = migrate(PORT);
  check("A: every migration applies from empty as that user: prisma migrate deploy exits 0", m.status === 0, (m.stdout + m.stderr).match(/(Error|P3018|message)[^\n]*/g)?.slice(0, 3));
  check("A: the migration role is a member of the reader (SET, USAGE); the reader is no member of it (no loop)", loopFree(PORT) === "true,true,false", loopFree(PORT));
  check("A: the reader may read and write every table in public (its rights, not the admin's membership)",
    q(PORT, "xr_admin", "select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and not has_table_privilege('xr_wall_reader', c.oid, 'SELECT,INSERT,UPDATE,DELETE')") === "0");

  // B — RDS 18.3 accepted the reader's grant (the 22 Nov failure on main)
  if (!start(PORT + 1)) { check("cluster B started", false); throw new Error("no cluster"); }
  q(PORT + 1, "xr_admin", "CREATE ROLE xr_wall_reader NOLOGIN BYPASSRLS", "postgres"); rdsAcceptedGrant(PORT + 1);
  check("B: before the run, the reader is a member of xr_admin as RDS 18.3's accepted grant makes it",
    q(PORT + 1, "postgres", "select count(*) from pg_auth_members where member = 'xr_wall_reader'::regrole and roleid = 'xr_admin'::regrole and grantor = 'xr_admin'::regrole", "postgres") === "1");
  m = migrate(PORT + 1);
  check("B: every migration applies: prisma migrate deploy exits 0 (main: P3018 / 0LP01 \"role xr_wall_reader is a member of role xr_admin\")",
    m.status === 0, (m.stdout + m.stderr).match(/(P3018|0LP01|PF-12 stopped|is a member of role)[^\n]*/g)?.slice(0, 3));
  check("B: afterwards the grants go one way only (admin in reader, reader not in admin)", loopFree(PORT + 1) === "true,true,false", loopFree(PORT + 1));
  check("B: xr_app cannot become the reader; it may SET ROLE to the bypass role only",
    q(PORT + 1, "xr_admin", "select pg_has_role('xr_app','xr_wall_reader','SET')||','||pg_has_role('xr_app','xr_staff_bypass','SET')||','||pg_has_role('xr_app','xr_staff_bypass','USAGE')") === "false,true,false");
  check("B: the reader is BYPASSRLS, NOLOGIN, no superuser", q(PORT + 1, "xr_admin", "select rolbypassrls||','||rolcanlogin||','||rolsuper from pg_roles where rolname = 'xr_wall_reader'") === "true,false,false");

  // C — the same membership on a reader that holds a right elsewhere on the cluster: stop, naming it, never a loop error
  if (!start(PORT + 2)) { check("cluster C started", false); throw new Error("no cluster"); }
  q(PORT + 2, "xr_admin", "CREATE ROLE xr_wall_reader NOLOGIN BYPASSRLS", "postgres"); rdsAcceptedGrant(PORT + 2);
  q(PORT + 2, "postgres", "GRANT CONNECT ON DATABASE postgres TO xr_wall_reader", "postgres");
  m = migrate(PORT + 2);
  check("C: a reader that holds something stops PF-12 with its message (exit non-zero, no raw 0LP01)",
    m.status !== 0 && /PF-12 stopped: role xr_wall_reader is a member of role xr_admin and cannot be made afresh \(.*privileges for database postgres/.test(m.stdout + m.stderr), (m.stdout + m.stderr).match(/(PF-12|0LP01|P3018)[^\n]*/g)?.slice(0, 3));
  check("C: …and leaves the reader and its right as they were (the block is one statement)",
    q(PORT + 2, "postgres", "select has_database_privilege('xr_wall_reader','postgres','CONNECT')||','||(select count(*) from pg_roles where rolname = 'xr_app')", "postgres") === "true,0");
} catch (e) { if (!failed) check("ran", false, String(e)); }

console.log(failed ? `${failed} failed` : `${total}/${total} passed`);
process.exit(failed ? 1 : 0);
