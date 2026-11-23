// PF-F1c (R1.24; AWS proof 23 Nov, Step 17): the web-address catch-up command (`tsx api/src/platform/web-address/
// firm-created.ts`) gives firms their address when it runs as the database's owner that is neither superuser nor
// BYPASSRLS (Amazon RDS's admin), under PF-12's walls. On main it stopped: "new row violates row-level security policy
// for table platform_firm_web_address", so the Sample firms seeded on staging had no address (404). An RDS-shaped runner
// owns the tables through membership, as check_fo7ts_money_settings.ts's. Through xr_studio it is in xr_case_lookup (as
// RDS's admin is in the roles it made), whose read policy on platform_firm is why staging's run found both firms. That
// policy is temporary ("until CS-W3 part 1", MODULE.md), so a second copy drops it: the owner's read then finds no firm,
// and the firms come from module_event and the Sample keys. The addresses another firm
// has, or holds for its redirect, are hidden from a firm's own transaction; the database's refusals name them and the
// next suggestion is taken. The app's own start-up run is check_pf25_web_address.ts's, unchanged. US$0.
//   tsx studio/tests/check_pff1c_catchup_walls.ts
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVENT } from "../ports/events.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const BASE = `xr_studio_pff1c_${process.pid}`, ROLE_A = `xr_pff1c_rds_${process.pid}`, ROLE_B = `xr_pff1c_bare_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const psql = (db: string, args: string[], user = "xr_studio") => execFileSync(join(BIN, "psql"), [urlOf(db, user), "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string, user?: string) => psql(db, ["-Atc", q], user);
const ADDRESSES = (keys: string[]) => `select string_agg(f.key || '=' || coalesce(w.address, '-'), ',' order by f.key) from platform_firm f left join platform_firm_web_address w on w.firm_id = f.id where f.key in (${keys.map((k) => `'${k}'`).join(",")})`;
const KEYS = ["firm-m", "firm-n", "firm-gone", "sample-firm", "sample-solo"];
/** The real command, as the runner: its exit code and its one JSON line. */
const command = (db: string, user: string) => {
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "tsx"), [join(STUDIO, "api", "src", "platform", "web-address", "firm-created.ts")],
    { cwd: STUDIO, encoding: "utf8", timeout: 120_000, env: { ...process.env, DATABASE_URL: urlOf(db, user) } });
  return { status: r.status, out: (r.stdout || r.stderr).trim().split("\n").at(-1) ?? "" };
};
const dbs = [BASE, `${BASE}_a`, `${BASE}_b`];
const roles = [ROLE_A, ROLE_B];

try {
  for (const db of dbs) execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db]);
  execFileSync(join(BIN, "createdb"), [...PG, BASE]);
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) psql(BASE, ["-f", join(MIG, d, "migration.sql")]);
  // the state staging had after Step 17: the Sample firms seeded (no address: the tasks had started before the seed), and
  // for the walls' hidden cases: firm Q has "maple-immigration", firm Z holds "maple-immigration-2" for its redirect
  // (both Maple firms' first suggestions), and two new firms with their firm.created events
  const db0 = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(BASE), options: "-c TimeZone=UTC" }) });
  await seedSampleFirms(db0); await db0.$disconnect();
  const mk = (key: string, name: string, status = "ACTIVE") => sql(BASE, `insert into platform_firm (id, key, operating_name, country_code, status, contact_email, updated_at) values (gen_random_uuid(), '${key}', '${name}', 'CA', '${status}', '${key}@${key}.example.com', now()) returning id`).split("\n").at(-1)!;
  const firmQ = mk("firm-q", "Quebec Law"), firmZ = mk("firm-z", "Zed Law");
  sql(BASE, `insert into platform_firm_web_address (firm_id, address, set_by, updated_at) values ('${firmQ}', 'maple-immigration', 'seed:test', now())`);
  sql(BASE, `insert into platform_firm_web_address (firm_id, address, set_by, updated_at) values ('${firmZ}', 'zed-law', 'seed:test', now());
    set session_replication_role = replica; insert into platform_firm_address_history (id, firm_id, old_address, new_address, reason, changed_by, changed_at, until) values (gen_random_uuid(), '${firmZ}', 'maple-immigration-2', 'zed-law', 'test', 'staff:test', now() - interval '30 days', now() - interval '30 days' + interval '2160 hours')`);
  const firmM = mk("firm-m", "Maple Immigration"), firmN = mk("firm-n", "Maple Immigration Inc."), firmGone = mk("firm-gone", "Gone Law", "DELETED");
  for (const f of [firmM, firmN, firmGone]) sql(BASE, `insert into module_event (id, firm_id, type, subject_id, payload) values (gen_random_uuid(), '${f}', '${EVENT.FIRM_CREATED}', '${f}', '{}')`);
  ok("set-up: no address yet for the two new firms and the Sample firms; the gone firm has an event too",
    sql(BASE, ADDRESSES(KEYS)) === "firm-gone=-,firm-m=-,firm-n=-,sample-firm=-,sample-solo=-", sql(BASE, ADDRESSES(KEYS)));
  for (const [i, role] of roles.entries()) {
    execFileSync(join(BIN, "createdb"), [...PG, "-T", BASE, dbs[i + 1]]);
    sql(BASE, `drop role if exists ${role}; create role ${role} login nosuperuser nobypassrls; grant xr_studio to ${role}; grant xr_wall_reader to ${role}`);
  }
  sql(dbs[2], "drop policy case_lookup_read on platform_firm");   // copy B only: the case side's read gone (CS-W3)
  for (const role of roles) ok(`set-up: ${role} is neither superuser nor BYPASSRLS, and owns the tables through membership (RDS's admin)`,
    sql(BASE, `select rolsuper || ',' || rolbypassrls from pg_roles where rolname = '${role}'`) === "false,false" && sql(BASE, `select pg_has_role('${role}', 'xr_studio', 'usage')`) === "t");
  ok("set-up: platform_firm_web_address is walled with FORCE (the owner too)", sql(BASE, `select relrowsecurity || ',' || relforcerowsecurity from pg_class where relname = 'platform_firm_web_address'`) === "true,true");

  // A: the RDS-faithful runner (in xr_case_lookup through xr_studio, so its read finds the firms, as on staging)
  const a = dbs[1];
  ok("PF-F1c: the RDS-shaped runner's own read of platform_firm finds the firms (xr_case_lookup's read policy, as on staging) but no address row (walled)",
    Number(sql(a, "select count(*) from platform_firm", ROLE_A)) >= 7 && sql(a, "select count(*) from platform_firm_web_address", ROLE_A) === "0");
  const runA = command(a, ROLE_A);
  ok("PF-F1c pass (R1.24): as the RDS-shaped owner the command exits 0 and names no failed firm (main: exit 1, every firm refused by the walls: on staging at the insert, here at the firm row's lock)",
    runA.status === 0 && /"failed":\[\]/.test(runA.out) && !/row-level security/.test(runA.out), runA);
  ok("PF-F1c pass: the Sample firms get their key; the Maple firms skip the address firm Q has and the one firm Z holds (both hidden by the walls) and take the next free ones; the gone firm gets none",
    sql(a, ADDRESSES(KEYS)) === "firm-gone=-,firm-m=maple-immigration-3,firm-n=maple-immigration-4,sample-firm=sample-firm,sample-solo=sample-solo", sql(a, ADDRESSES(KEYS)));
  ok("PF-F1c pass: one audit line per address set, in its firm's trail, by the catch-up's actor",
    sql(a, `select count(*) || ':' || count(distinct firm_id) from audit_event where action = 'firm.web_address.set' and actor = 'system:firm-created'`) === "4:4");
  ok("PF-F1c pass: firm Q's address and firm Z's held one are untouched", sql(a, `select address from platform_firm_web_address where firm_id = '${firmQ}'`) === "maple-immigration"
    && sql(a, `select count(*) from platform_firm_address_history where firm_id = '${firmZ}' and old_address = 'maple-immigration-2'`) === "1");
  const rowsA = sql(a, "select count(*) from platform_firm_web_address"), againA = command(a, ROLE_A);
  ok("PF-F1c fail: a second run changes nothing (exit 0, no new row, no new audit line)",
    againA.status === 0 && /"failed":\[\]/.test(againA.out) && sql(a, "select count(*) from platform_firm_web_address") === rowsA
    && sql(a, `select count(*) from audit_event where action = 'firm.web_address.set'`) === "4", againA);
  ok("PF-F1c: the walls are as they were after the run (ENABLE and FORCE; xr_app reads no address row with no firm)",
    sql(a, `select relrowsecurity || ',' || relforcerowsecurity from pg_class where relname = 'platform_firm_web_address'`) === "true,true" && sql(a, "select count(*) from platform_firm_web_address", "xr_app") === "0");

  // B: the same runner on a copy without the case side's read: the walls blind its read of platform_firm entirely, so the
  // firms come from module_event and the Sample keys
  const b = dbs[2];
  ok("PF-F1c: the second runner's own read of platform_firm finds no firm (walled, no session firm)", sql(b, "select count(*) from platform_firm", ROLE_B) === "0");
  const runB = command(b, ROLE_B);
  ok("PF-F1c pass: with platform_firm hidden too, the command finds the firms by their events and the Sample keys and gives the same addresses",
    runB.status === 0 && /"failed":\[\]/.test(runB.out) && sql(b, ADDRESSES(KEYS)) === "firm-gone=-,firm-m=maple-immigration-3,firm-n=maple-immigration-4,sample-firm=sample-firm,sample-solo=sample-solo", [runB, sql(b, ADDRESSES(KEYS))]);

  // the command as the cluster superuser (the Mac, lanes): unchanged result on a fresh copy
  execFileSync(join(BIN, "createdb"), [...PG, "-T", BASE, `${BASE}_c`]); dbs.push(`${BASE}_c`);
  const runC = command(`${BASE}_c`, "xr_studio");
  ok("PF-F1c: as a superuser (the Mac, lanes) the command gives the same addresses",
    runC.status === 0 && sql(`${BASE}_c`, ADDRESSES(KEYS)) === "firm-gone=-,firm-m=maple-immigration-3,firm-n=maple-immigration-4,sample-firm=sample-firm,sample-solo=sample-solo", [runC, sql(`${BASE}_c`, ADDRESSES(KEYS))]);
} catch (e) {
  ok("the check ran to the end", false, String((e as { stderr?: string }).stderr ?? e).slice(0, 600));
} finally {
  for (const db of dbs) spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db], { stdio: "ignore" });
  for (const role of roles) spawnSync(join(BIN, "psql"), [urlOf("postgres"), "-qc", `drop role if exists ${role}`], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
