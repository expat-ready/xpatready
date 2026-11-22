// PF-8b F8 (Amazon RDS; R1.13, R1.15, R1.5, R1.24): the two Sample seeds, api/src/platform/seed-sample-firms.ts and then
// api/src/front-office/firm-seed.ts, run to the end as the database's owner that is neither superuser nor BYPASSRLS
// (RDS's admin; the AWS proof of 22 Nov 19:16 IST got 42501 "new row violates row-level security policy for table
// platform_firm"). Each Sample firm is written as itself (app.firm_id in the seed's own transaction), with no bypass role
// and no hand-written SQL; a second run changes nothing; the walls still refuse that runner a firm row with no firm; and
// the same seeds run as a superuser give the same rows.
// Throwaway cluster (initdb; as the postgres user when run as root), removed at the end. US$0.
//   tsx studio/tests/check_pf8b_f8_seeds_nobypass.ts [port]     (default 15481; one port; PGBIN=<PostgreSQL 18 bin>)
import { execFileSync, spawnSync } from "node:child_process";
import { chownSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const STUDIO = join(import.meta.dirname, "..");
const PORT = Number(process.argv[2] ?? 15481);
let failed = 0, total = 0;
const check = (name: string, ok: boolean, got?: unknown) => { total++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `: ${JSON.stringify(got)}`}`); if (!ok) failed++; };

const which = spawnSync("bash", ["-c", "command -v initdb"], { encoding: "utf8" }).stdout.trim();
const PGBIN = process.env.PGBIN ?? (existsSync("/usr/lib/postgresql/18/bin/initdb") ? "/usr/lib/postgresql/18/bin" : dirname(which || "/opt/homebrew/opt/postgresql@18/bin/initdb"));
const root = process.getuid?.() === 0;
const asPg = (cmd: string, args: string[]) => (root ? ["runuser", ["-u", "postgres", "--", cmd, ...args]] : [cmd, args]) as [string, string[]];
const dir = `/tmp/pf8b-f8-${PORT}`;
const psql = (user: string, sql: string, db: string) => spawnSync("psql", ["-h", "127.0.0.1", "-p", String(PORT), "-U", user, "-d", db, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
const q = (user: string, sql: string, db: string) => { const r = psql(user, sql, db); return (r.stdout + r.stderr).trim(); };
function start(): boolean {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  if (root) chownSync(dir, Number(execFileSync("id", ["-u", "postgres"], { encoding: "utf8" })), Number(execFileSync("id", ["-g", "postgres"], { encoding: "utf8" })));
  const init = asPg(join(PGBIN, "initdb"), ["-D", `${dir}/data`, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C.UTF-8"]);
  if (spawnSync(init[0], init[1], { stdio: "ignore" }).status !== 0) return false;
  const run = asPg(join(PGBIN, "pg_ctl"), ["-D", `${dir}/data`, "-o", `-p ${PORT} -k ${dir} -c listen_addresses=127.0.0.1 -c log_error_verbosity=terse -c shared_buffers=16MB -c max_connections=40`, "-l", `${dir}/log`, "-w", "start"]);
  if (spawnSync(run[0], run[1], { stdio: "ignore" }).status !== 0) return false;
  for (const s of ["CREATE ROLE rds_superuser NOLOGIN", "CREATE ROLE xr_admin LOGIN CREATEROLE CREATEDB NOSUPERUSER BYPASSRLS", "GRANT rds_superuser TO xr_admin WITH ADMIN OPTION",
    "CREATE DATABASE xr_rds OWNER xr_admin", "CREATE DATABASE xr_su OWNER xr_admin"]) if (psql("postgres", s, "postgres").status !== 0) return false;
  return true;
}
function stop() { const s = asPg(join(PGBIN, "pg_ctl"), ["-D", `${dir}/data`, "stop", "-m", "fast"]); spawnSync(s[0], s[1], { stdio: "ignore" }); rmSync(dir, { recursive: true, force: true }); }
const url = (user: string, db: string) => `postgresql://${user}@127.0.0.1:${PORT}/${db}`;
const run = (args: string[], user: string, db: string) => spawnSync(join(STUDIO, "node_modules", ".bin", args[0]), args.slice(1),
  { cwd: STUDIO, encoding: "utf8", timeout: 600_000, env: { ...process.env, DATABASE_URL: url(user, db), PLATFORM_ENVIRONMENT: "local" } });
// --tsconfig api/tsconfig.json: the settings step loads a NestJS service (parameter decorators), as the API does
const seedFirms = (user: string, db: string) => run(["tsx", "--tsconfig", "api/tsconfig.json", "api/src/platform/seed-sample-firms.ts"], user, db);
const seedFront = (user: string, db: string) => run(["tsx", "--tsconfig", "api/tsconfig.json", "api/src/front-office/firm-seed.ts"], user, db);
const json = (r: ReturnType<typeof run>) => { try { return JSON.parse(r.stdout.trim().split("\n").pop() ?? "null"); } catch { return null; } };
const tail = (r: ReturnType<typeof run>) => (r.stdout + r.stderr).split("\n").filter((l) => /error|ERROR|42501|violates|"firmsAdded"|"failed"/.test(l)).slice(0, 3).map((l) => l.slice(0, 300));
/** The seeded rows, by their natural keys only (ids and times differ from run to run and database to database). */
const SNAPSHOT = `select concat_ws(E'\\n',
  (select string_agg(key || ':' || operating_name || ':' || country_code || ':' || status || ':' || owner_email, ',' order by key) from platform_firm),
  (select string_agg(f.key || ':' || s.actor_id || ':' || s.email || ':' || s.status, ',' order by f.key, s.actor_id) from platform_staff s join platform_firm f on f.id = s.firm_id),
  (select string_agg(f.key || ':' || s.actor_id || ':' || g.role, ',' order by f.key, s.actor_id, g.role) from platform_role_grant g join platform_staff s on s.id = g.staff_id join platform_firm f on f.id = g.firm_id),
  (select string_agg(f.key || ':' || c.licence_number, ',' order by f.key, c.licence_number) from platform_staff_credential c join platform_firm f on f.id = c.firm_id),
  (select string_agg(f.key || ':' || p.code || ':' || u.status, ',' order by f.key) from platform_subscription u join platform_firm f on f.id = u.firm_id join platform_plan p on p.id = u.plan_id),
  (select string_agg(f.key || ':' || v.kind || ':' || coalesce(s.actor_id, '-'), ',' order by f.key, v.kind, s.actor_id) from platform_terms_acceptance a join platform_terms_version v on v.id = a.version_id join platform_firm f on f.id = a.firm_id left join platform_staff s on s.id = a.staff_id),
  (select string_agg(f.key || ':' || x.key, ',' order by f.key, x.key) from platform_firm_setting x join platform_firm f on f.id = x.firm_id),
  (select string_agg(f.key || ':' || (select count(*) from fo_stage t where t.firm_id = f.id) || ':' || (select count(*) from fo_reason t where t.firm_id = f.id) || ':' || (select count(*) from fo_web_form t where t.firm_id = f.id) || ':' || (select count(*) from fo_service t where t.firm_id = f.id) || ':' || (select count(*) from msg_consent_wording t where t.firm_id = f.id) || ':' || (select (seeded_at is not null)::text from fo_sales_setup t where t.firm_id = f.id), ',' order by f.key) from platform_firm f),
  (select count(*)::text from audit_event))`;
process.on("exit", stop);

try {
  if (!start()) { check("cluster started", false, PGBIN); throw new Error("no cluster"); }
  check("PostgreSQL 18", /^18\./.test(q("postgres", "show server_version", "postgres")), q("postgres", "show server_version", "postgres"));
  // the RDS state: every migration applied (PF-12 makes BYPASSRLS roles, which only a BYPASSRLS role may on vanilla
  // PostgreSQL; RDS let its admin), then the admin without BYPASSRLS, as RDS's is
  for (const db of ["xr_rds", "xr_su"]) {
    const m = run(["prisma", "migrate", "deploy"], "xr_admin", db);
    check(`${db}: every migration applies`, m.status === 0, tail(m));
  }
  psql("postgres", "ALTER ROLE xr_admin NOBYPASSRLS", "postgres");
  check("the seeds' runner is the owner, neither superuser nor BYPASSRLS (Amazon RDS's admin)",
    q("xr_admin", "select rolsuper || ',' || rolbypassrls from pg_roles where rolname = current_user", "xr_rds") === "false,false");

  // first run, as that owner
  let a = seedFirms("xr_admin", "xr_rds");
  const ja = json(a);
  check("seed-sample-firms.ts completes as that owner (exit 0; main: 42501 on platform_firm) and adds the two Sample firms",
    a.status === 0 && ja?.firmsAdded === 2 && ja?.staffAdded > 0 && ja?.subscriptionsAdded === 2, { exit: a.status, out: ja ?? tail(a) });
  let b = seedFront("xr_admin", "xr_rds");
  const jb = json(b);
  check("firm-seed.ts then completes (exit 0, nothing failed) and seeds both Sample firms' front office",
    b.status === 0 && jb?.failed?.length === 0 && jb?.sample?.results?.filter((x: { seeded: boolean }) => x.seeded).length === 2 && jb?.sample?.missing?.length === 0, { exit: b.status, out: jb ?? tail(b) });
  const first = q("postgres", SNAPSHOT, "xr_rds");

  // second run: nothing changes
  a = seedFirms("xr_admin", "xr_rds"); b = seedFront("xr_admin", "xr_rds");
  const ja2 = json(a), jb2 = json(b);
  check("a second run of both completes and adds nothing",
    a.status === 0 && b.status === 0 && ja2?.firmsAdded === 0 && ja2?.staffAdded === 0 && ja2?.grantsAdded === 0 && ja2?.credentialsAdded === 0 && ja2?.subscriptionsAdded === 0
      && jb2?.sample?.results?.every((x: { seeded: boolean }) => !x.seeded) && jb2?.failed?.length === 0, { firms: ja2 ?? tail(a), front: jb2 ?? tail(b) });
  check("…and every seeded row is as after the first run (firms, staff, roles, licences, plans, acceptances, settings, front office, audit lines)",
    q("postgres", SNAPSHOT, "xr_rds") === first, { first, second: q("postgres", SNAPSHOT, "xr_rds") });

  // the fail: the walls still refuse this runner a firm row with no firm (nothing passed by a bypass)
  const refused = q("xr_admin", "insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values (gen_random_uuid(), 'f8-probe', 'Probe', 'CA', 'p@example.test', now())", "xr_rds");
  check("the walls still refuse that owner a firm row with no firm in its transaction (42501): the seeds pass only as each firm", /row-level security policy for table "platform_firm"/.test(refused), refused);
  check("…and the owner reads no seeded staff with no firm (the walls hold after the seeds)", q("xr_admin", "select count(*) from platform_staff", "xr_rds") === "0", q("xr_admin", "select count(*) from platform_staff", "xr_rds"));

  // the superuser path gives the same rows
  const sa = seedFirms("postgres", "xr_su"), sb = seedFront("postgres", "xr_su");
  check("the same seeds as a superuser complete", sa.status === 0 && sb.status === 0 && json(sb)?.failed?.length === 0, { firms: tail(sa), front: tail(sb) });
  check("…and give the same seeded rows as the owner's run", q("postgres", SNAPSHOT, "xr_su") === first, { owner: first, superuser: q("postgres", SNAPSHOT, "xr_su") });
} catch (e) { if (!failed) check("ran", false, String(e)); }

console.log(failed ? `${failed} failed` : `${total}/${total} passed`);
process.exit(failed ? 1 : 0);
