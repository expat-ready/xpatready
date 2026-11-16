// PF-12 (BACKLOG row PF-12, rows rev 4, 14, 16.2, 16.7, 16.34; Lead B's brief; contracts §0 rule 2, §7, §9; map row 3;
// AG-1-1, AG-1-3, AG-1-45): database walls between firms. Every line of the row's "Done when", each with a passing and a
// failing case:
//   * a raw query with no app.firm_id reads nothing; firm A's session reading firm B's row by id reads nothing, and a
//     write naming firm B is refused, for one table of each family (platform_, fo_, money_, msg_, plat_complaint);
//   * the app's role owns no table, is not a superuser, has no BYPASSRLS, cannot set session_replication_role or disable
//     a trigger, and logs terse errors; the API refuses to start as a table owner (the real main.ts, started twice);
//   * the bypass role is refused for a use or a route not on its named list, and every use writes its line;
//   * xr_case_lookup cannot log in and owns no table;
//   * the missing-policy guard: every platform_*, fo_*, money_*, msg_*, auto_* and plat_complaint* table, including
//     every later migration's, has its forced policy, unless it is on the named exception list.
// Three scratch databases: "bare" gets every migration before PF-12's, "empty" every migration, "demo" every migration
// before PF-12's, then demo-shaped rows (the Sample firms and staff, the front office's Sample rows), then PF-12's and
// any later one. The migration is measured right after itself (rows rev 16.7: it is never assumed to be the newest).
// No browser, no model call (US$0). Every value is Sample. All databases are dropped at the end.
//   tsx studio/tests/check_pf12_walls.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { appDatabaseUrl, appRoleProblems, asBypass, BypassRefused, currentFirm, inRequest, onBypassLine, oneQueryPerCaller, setRequestFirm, WalledPool, withFirm } from "../api/src/platform/firm-scope.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const NEW = "20261116013000_pf12_firm_walls";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const EMPTY = `xr_studio_pf12_empty_${process.pid}`, DEMO = `xr_studio_pf12_demo_${process.pid}`, BARE = `xr_studio_pf12_bare_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
/** The families the walls cover (contracts §9) and the named exceptions (brief): catalogues with no firm_id, and our own
 *  registers that only the bypass role reaches. Nothing else may go without a forced policy. */
const FAMILIES = /^(platform_|fo_|money_|msg_|auto_|plat_complaint)/;
const EXCEPTIONS = ["platform_plan", "platform_role_permission", "platform_setting_definition", "platform_permission_key", "plat_breach", "plat_data_request", "plat_legal_hold"];

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const psql = (url: string, args: string[]) => execFileSync(join(BIN, "psql"), [url, "-X", "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string, user = "xr_studio") => psql(urlOf(db, user), ["-Atc", q]);
/** As the app's role, in one transaction with the given firm (or none). */
const asApp = (db: string, firm: string | null, q: string) => sql(db, `begin; ${firm ? `select set_config('app.firm_id', '${firm}', true);` : ""} ${q}; commit;`, "xr_app").split("\n").filter((l) => l !== "" && l !== firm).join("\n");
const refused = (fn: () => unknown, re: RegExp) => { try { fn(); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? (e as Error).message ?? e)); } };

/** The tables of the families with no forced firm policy, not on the exception list: the guard every later row runs. */
function unwalled(db: string): string[] {
  const rows = sql(db, `select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
    and (not c.relrowsecurity or not c.relforcerowsecurity or not exists (select 1 from pg_policy p where p.polrelid = c.oid))
    order by 1`).split("\n").filter(Boolean);
  return rows.filter((t) => FAMILIES.test(t) && !EXCEPTIONS.includes(t));
}
const familyTables = (db: string) => sql(db, `select tablename from pg_tables where schemaname = 'public' order by 1`).split("\n").filter((t) => FAMILIES.test(t));
const count = (db: string, t: string) => Number(sql(db, `select count(*) from "${t}"`));

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const db of [EMPTY, DEMO, BARE]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
const clients: { $disconnect(): Promise<void> }[] = [];
const pools: pg.Pool[] = [];
try {
  // ------------------------------------------------------------------------------------------------- the migration
  const before = all.filter((d) => d < NEW), text = readFileSync(join(MIG, NEW, "migration.sql"), "utf8"), code = text.replace(/^\s*--.*$/gm, "");
  ok(`PF-12: the migration has its own stamp, later than every one before it and unique (newest before it: ${before.at(-1)}; P-348 (8), P-600 (4))`,
    all.includes(NEW) && before.every((d) => d < NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1, all.slice(-3));
  const altered = [...code.matchAll(/ALTER TABLE "\w+" ([^;]+);/g)].map((m) => m[1]);
  ok("PF-12 (brief): policies and roles only — no CREATE/DROP TABLE, no column, key or index change; every ALTER TABLE only enables or forces row-level security",
    altered.length > 0 && altered.every((a) => /^(ENABLE|FORCE) ROW LEVEL SECURITY$/.test(a)) && !/\b(CREATE|DROP)\s+(TABLE|INDEX|TYPE)\b|\bADD\s+COLUMN\b|^\s*(UPDATE|DELETE|INSERT|TRUNCATE)\b/im.test(code), altered.filter((a) => !/ROW LEVEL SECURITY/.test(a)));
  const fns = [...code.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g)].map((m) => m[1]);
  ok("PF-12 (rows rev 15.2): every function the migration creates carries the area prefix platform_", fns.length >= 1 && fns.every((f) => f.startsWith("platform_")), fns);
  ok("PF-12 (rev 16.34): xr_case_lookup is created only when missing (CS-W1 part 1 may have created it), and NOLOGIN",
    /IF NOT EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'xr_case_lookup'\) THEN CREATE ROLE xr_case_lookup NOLOGIN/.test(code) && /ALTER ROLE xr_case_lookup NOLOGIN/.test(code));

  // Right after its own migration (rows rev 16.7): bare gets every migration before it, then it, then is measured.
  for (const d of before) psql(urlOf(BARE), ["-f", join(MIG, d, "migration.sql")]);
  const bareUnwalled = unwalled(BARE);
  ok("PF-12 fail: before the migration the firm tables have no wall (the guard lists them)", bareUnwalled.length >= 50 && bareUnwalled.includes("fo_lead") && bareUnwalled.includes("money_invoice"), bareUnwalled.length);
  psql(urlOf(BARE), ["-f", join(MIG, NEW, "migration.sql")]);
  const walled = familyTables(BARE).filter((t) => !EXCEPTIONS.includes(t));
  ok(`PF-12 pass: right after the migration every table of the families has its forced policy (${walled.length} tables; exceptions ${EXCEPTIONS.filter((t) => familyTables(BARE).includes(t)).join(", ")})`, unwalled(BARE).length === 0 && walled.length >= 60, unwalled(BARE));
  ok("PF-12: the catalogues on the exception list stay outside the walls (no firm_id: platform_plan, platform_role_permission, platform_setting_definition, platform_permission_key)",
    sql(BARE, `select count(*) from pg_class where relname in ('platform_plan','platform_role_permission','platform_setting_definition','platform_permission_key') and not relrowsecurity`) === "4");

  for (const d of all) psql(urlOf(EMPTY), ["-f", join(MIG, d, "migration.sql")]);
  ok("PF-12 pass: every migration applies in order to an empty database", sql(EMPTY, `select count(*) from pg_policy where polname = 'pf12_firm'`) !== "0");
  // The guard for every later row: the newest database (every migration) still has no unwalled firm table.
  ok("PF-12 guard pass: with every migration on main, no platform_*, fo_*, money_*, msg_*, auto_* or plat_complaint* table is without its forced policy", unwalled(EMPTY).length === 0, unwalled(EMPTY));
  // ... and it fails for a table that forgot (the probes are dropped again).
  sql(EMPTY, `create table fo_pf12_probe (id uuid primary key, firm_id uuid not null); create table auto_pf12_probe (id uuid primary key, firm_id uuid not null); create table plat_complaint_pf12_probe (id uuid primary key, firm_id uuid not null);
    create table money_pf12_probe (id uuid primary key, firm_id uuid not null); alter table money_pf12_probe enable row level security; create policy p on money_pf12_probe using (firm_id = platform_session_firm());`);
  const probes = unwalled(EMPTY);
  ok("PF-12 guard fail: a new fo_, auto_ or plat_complaint table with no policy, and a money_ table whose policy is not forced, are each named",
    ["fo_pf12_probe", "auto_pf12_probe", "plat_complaint_pf12_probe", "money_pf12_probe"].every((t) => probes.includes(t)), probes);
  // Default privileges: a later migration's table is open to the app's role (a grant) but walled once it has its policy.
  ok("PF-12: a later migration's table gets the app's table rights by default privileges (xr_app may read it, so the policy is what walls it)",
    asApp(EMPTY, null, "select count(*) from fo_pf12_probe") === "0");
  sql(EMPTY, "drop table fo_pf12_probe, auto_pf12_probe, plat_complaint_pf12_probe, money_pf12_probe");

  // ------------------------------------------------------------------------------------------------------ the roles
  const role = (r: string) => sql(EMPTY, `select rolsuper, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb, rolreplication from pg_roles where rolname = '${r}'`);
  ok("PF-12 pass: xr_app can log in and is not a superuser, has no BYPASSRLS, cannot create roles or databases", role("xr_app") === "f|f|t|f|f|f", role("xr_app"));
  ok("PF-12 fail: the migration role (xr_studio, the tables' owner) is the superuser that the app must not be", role("xr_studio").startsWith("t|"), role("xr_studio"));
  const owner = sql(EMPTY, `select string_agg(distinct tableowner, ',') from pg_tables where schemaname = 'public'`);
  ok("PF-12: the migration role owns every table; xr_app owns none (nor any role it is a member of)", owner === "xr_studio" && sql(EMPTY, `select count(*) from pg_class where relnamespace = 'public'::regnamespace and pg_has_role('xr_app', relowner, 'MEMBER')`) === "0", owner);
  const appPool = new pg.Pool({ connectionString: appDatabaseUrl(urlOf(EMPTY), {}) }), ownerPool = new pg.Pool({ connectionString: urlOf(EMPTY) });
  pools.push(appPool, ownerPool);
  const viaPool = (p: pg.Pool) => (s: string) => p.query(s) as Promise<{ rows: Record<string, unknown>[] }>;
  const appProblems = await appRoleProblems(viaPool(appPool)), ownerProblems = await appRoleProblems(viaPool(ownerPool));
  ok("PF-12 start-up check pass: as xr_app nothing is wrong", appProblems.length === 0, appProblems);
  ok("PF-12 start-up check fail: as the owner it names the superuser and the owned tables", ownerProblems.some((p) => /superuser/.test(p)) && ownerProblems.some((p) => /owns/.test(p)), ownerProblems);
  // A plain (not superuser) role that owns one table, and one with BYPASSRLS: each refused by the same check.
  sql(EMPTY, `do $$ begin if not exists (select 1 from pg_roles where rolname = 'xr_pf12_probe_owner') then create role xr_pf12_probe_owner login; end if; end $$;
    create table pf12_probe_owned (id int); alter table pf12_probe_owned owner to xr_pf12_probe_owner;`);
  const probeOwnerPool = new pg.Pool({ connectionString: urlOf(EMPTY, "xr_pf12_probe_owner") }); pools.push(probeOwnerPool);
  const probeOwner = await appRoleProblems(viaPool(probeOwnerPool));
  ok("PF-12 start-up check fail: a plain role that owns one table is refused (not only a superuser)", probeOwner.length === 1 && /owns .*1 table/.test(probeOwner[0]), probeOwner);
  await probeOwnerPool.end(); pools.splice(pools.indexOf(probeOwnerPool), 1);
  sql(EMPTY, "drop table pf12_probe_owned; drop role xr_pf12_probe_owner");

  const asAppRaw = (q: string) => sql(EMPTY, q, "xr_app");
  ok("PF-12 (FO-13 break 4) fail: xr_app cannot set session_replication_role (triggers and keys stay on)", refused(() => asAppRaw("set session_replication_role = replica"), /permission denied/i));
  ok("PF-12 (FO-13 break 4) fail: xr_app cannot disable a trigger (owner only)", refused(() => asAppRaw(`alter table "fo_lead" disable trigger all`), /must be owner/i));
  ok("PF-12 fail: xr_app cannot create a table, so it can never own one", refused(() => asAppRaw("create table pf12_mine (id int)"), /permission denied/i));
  ok("PF-12 fail: xr_app cannot become the owner or the case lookup role (SET ROLE refused)", refused(() => asAppRaw("set role xr_studio"), /permission denied/i) && refused(() => asAppRaw("set role xr_case_lookup"), /permission denied/i));
  ok("PF-12 fail: xr_app cannot turn row-level security off for itself (row_security = off is refused for a policied table)", refused(() => asAppRaw(`set row_security = off; select count(*) from "platform_staff"`), /row-level security/i));
  ok("PF-12 pass: xr_app may SET ROLE to the bypass role only (SET, not inherited: without it xr_app has no BYPASSRLS)",
    asAppRaw("set role xr_staff_bypass; select current_user") === "xr_staff_bypass" && sql(EMPTY, `select count(*) from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member where u.rolname = 'xr_app' and r.rolname = 'xr_staff_bypass' and m.inherit_option = false and m.set_option = true`) === "1");
  const terse = sql(EMPTY, `select coalesce(string_agg(c, ','), '') from pg_db_role_setting s join pg_roles r on r.oid = s.setrole, unnest(s.setconfig) c where r.rolname = 'xr_app'`);
  ok("PF-12 (FO-13 break 11): xr_app logs terse errors, so a refused row's DETAIL never repeats its values in the log", /log_error_verbosity=terse/.test(terse) && asAppRaw("show log_error_verbosity") === "terse", terse);
  const lookup = sql(EMPTY, `select rolcanlogin, (select count(*) from pg_class where relowner = r.oid), (select count(*) from information_schema.role_table_grants where grantee = 'xr_case_lookup') from pg_roles r where rolname = 'xr_case_lookup'`);
  ok("PF-12 (rev 16.34): xr_case_lookup cannot log in, owns no table and holds no table grant", lookup === "f|0|0", lookup);
  ok("PF-12 (rev 16.34) fail: signing in as xr_case_lookup is refused", refused(() => sql(EMPTY, "select 1", "xr_case_lookup"), /not permitted to log in/i));
  // Idempotent: the roles part again (as when CS-W1 part 1 or another database on the cluster ran it first) changes nothing.
  const rolesPart = text.slice(text.indexOf("DO $$"), text.indexOf("GRANT USAGE ON SCHEMA"));
  psql(urlOf(EMPTY), ["-c", rolesPart]);
  ok("PF-12: the roles part runs again with every role already there, changing nothing", role("xr_app") === "f|f|t|f|f|f" && lookup === sql(EMPTY, `select rolcanlogin, (select count(*) from pg_class where relowner = r.oid), (select count(*) from information_schema.role_table_grants where grantee = 'xr_case_lookup') from pg_roles r where rolname = 'xr_case_lookup'`));

  // ----------------------------------------------------------------------------------- the walls on demo-shaped data
  for (const d of before) psql(urlOf(DEMO), ["-f", join(MIG, d, "migration.sql")]);
  const seedDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DEMO), options: "-c TimeZone=UTC" }) }); clients.push(seedDb);
  await seedSampleFirms(seedDb);
  await seedSampleFirmsFrontOffice(seedDb);
  const tables = familyTables(DEMO), counts = Object.fromEntries(tables.map((t) => [t, count(DEMO, t)]));
  for (const d of all.filter((d) => d >= NEW)) psql(urlOf(DEMO), ["-f", join(MIG, d, "migration.sql")]);
  ok("PF-12 pass: the migration applies on the demo-data copy and changes no row (owner's counts the same on every family table)",
    tables.every((t) => count(DEMO, t) === counts[t]) && Object.values(counts).reduce((a, b) => a + b, 0) > 0, tables.filter((t) => count(DEMO, t) !== counts[t]));
  const firms = sql(DEMO, "select id from platform_firm order by key").split("\n").filter(Boolean);
  ok("PF-12: the demo-data copy has at least two Sample firms", firms.length >= 2, firms);
  const [A, B] = firms;
  // Rows for families the seed leaves empty: one per firm, written as the owner.
  sql(DEMO, `insert into msg_firm (firm_id) select id from platform_firm where id in ('${A}', '${B}') on conflict do nothing`);
  sql(DEMO, `insert into platform_firm_setting (firm_id, key, value, changed_by, changed_at) select f.id, d.key, '"Sample"', 'test', now() from platform_firm f, (select key from platform_setting_definition order by key limit 1) d where f.id in ('${A}', '${B}') on conflict do nothing`);
  sql(DEMO, `insert into money_payment_settings (firm_id, updated_at, updated_by) select id, now(), 'test' from platform_firm where id in ('${A}', '${B}') on conflict do nothing`);
  sql(DEMO, `insert into money_number_series (firm_id, kind, prefix) select id, 'INVOICE', 'INV-' from platform_firm where id in ('${A}', '${B}') on conflict do nothing`);
  const withRows = tables.filter((t) => !EXCEPTIONS.includes(t) && count(DEMO, t) > 0);
  const noFirm = withRows.filter((t) => asApp(DEMO, null, `select count(*) from "${t}"`) !== "0");
  ok(`PF-12 pass: a raw query with no app.firm_id reads nothing from any walled table that has rows (${withRows.length} tables)`, withRows.length >= 5 && noFirm.length === 0, noFirm);
  ok("PF-12 fail: the same tables do have rows (the owner reads them), and a catalogue outside the walls still reads with no firm",
    withRows.every((t) => count(DEMO, t) > 0) && Number(asApp(DEMO, null, `select count(*) from "platform_permission_key"`)) > 0);
  const own = (t: string, f: string) => Number(asApp(DEMO, f, `select count(*) from "${t}" where ${t === "platform_firm" ? "id" : "firm_id"} = '${f}'`));
  const theirs = (t: string, f: string, other: string) => asApp(DEMO, f, `select count(*) from "${t}" where ${t === "platform_firm" ? "id" : "firm_id"} = '${other}'`);
  // One table of each family that has rows for both firms (or the closest the Sample data gives).
  const family = (re: RegExp) => withRows.find((t) => re.test(t) && Number(sql(DEMO, `select count(distinct ${t === "platform_firm" ? "id" : "firm_id"}) from "${t}" where ${t === "platform_firm" ? "id" : "firm_id"} in ('${A}','${B}')`)) === 2);
  const picks = ["platform_staff", family(/^fo_/), family(/^money_/), family(/^msg_/), "platform_firm"].filter((t): t is string => !!t);
  for (const t of picks) {
    // The row's key: its id where it has one, else the firm and kind (money_number_series is keyed by firm and kind).
    const hasId = sql(DEMO, `select count(*) from information_schema.columns where table_name = '${t}' and column_name = 'id'`) === "1";
    const key = hasId ? `id = '${sql(DEMO, `select id from "${t}" where ${t === "platform_firm" ? "id" : "firm_id"} = '${B}' limit 1`)}'` : `firm_id = '${B}'`;
    const set = hasId ? "id = id" : "firm_id = firm_id";
    ok(`PF-12 pass: firm A's session reads its own ${t} rows`, own(t, A) > 0);
    ok(`PF-12 fail: firm A's session reading firm B's ${t} row by ${hasId ? "id" : "key"} gets nothing (and no B row by firm)`, asApp(DEMO, A, `select count(*) from "${t}" where ${key}`) === "0" && theirs(t, A, B) === "0");
    ok(`PF-12 fail: firm A's session cannot change or delete firm B's ${t} row (0 rows; still there for the owner)`, asApp(DEMO, A, `with u as (update "${t}" set ${set} where ${key} returning 1) select count(*) from u`) === "0" && asApp(DEMO, A, `with d as (delete from "${t}" where ${key} returning 1) select count(*) from d`) === "0" && Number(sql(DEMO, `select count(*) from "${t}" where ${key}`)) >= 1);
  }
  ok(`PF-12: one table of each family was found with both firms' rows (${picks.join(", ")})`, picks.length === 5, picks);
  const KEY = `'${sql(DEMO, "select key from platform_setting_definition order by key limit 1")}'`;
  ok("PF-12 fail: firm A's session cannot write a row naming firm B (WITH CHECK refuses it)",
    refused(() => asApp(DEMO, A, `insert into platform_firm_setting (firm_id, key, value, changed_by, changed_at) values ('${B}', ${KEY}, '1', 'test', now())`), /row-level security/i)
    && refused(() => asApp(DEMO, A, `update platform_firm_setting set firm_id = '${B}' where firm_id = '${A}'`), /row-level security/i));
  ok("PF-12 pass: firm A's session changes its own rows", Number(asApp(DEMO, A, `with u as (update platform_firm_setting set changed_by = changed_by where firm_id = '${A}' returning 1) select count(*) from u`)) > 0);
  ok("PF-12 fail: with no firm a write is refused", refused(() => asApp(DEMO, null, `insert into platform_firm_setting (firm_id, key, value, changed_by, changed_at) values ('${A}', ${KEY}, '1', 'test', now())`), /row-level security/i));
  ok("PF-12 fail: an app.firm_id that is not a uuid is an error, never a match", refused(() => sql(DEMO, `begin; select set_config('app.firm_id', 'x', true); select count(*) from platform_staff; commit;`, "xr_app"), /invalid input syntax for type uuid/i));
  // Platform-owned templates (firm_id null): firms read them; nobody but the bypass role writes them.
  sql(DEMO, `insert into msg_template (id, firm_id, owner, key, kind, channel, language, updated_at) values ('00000000-0000-4000-8000-00000000f012', null, 'PLATFORM', 'pf12.probe', 'probe', 'EMAIL', 'en', now())`);
  ok("PF-12 pass: a firm reads a platform-owned template (firm_id null)", asApp(DEMO, A, `select count(*) from msg_template where id = '00000000-0000-4000-8000-00000000f012'`) === "1");
  ok("PF-12 fail: with no firm the platform template reads nothing; a firm cannot change or add one",
    asApp(DEMO, null, `select count(*) from msg_template where id = '00000000-0000-4000-8000-00000000f012'`) === "0"
    && asApp(DEMO, A, `with u as (update msg_template set key = 'x' where id = '00000000-0000-4000-8000-00000000f012' returning 1) select count(*) from u`) === "0"
    && refused(() => asApp(DEMO, A, `insert into msg_template (id, firm_id, owner, key, kind, channel, language, updated_at) values (gen_random_uuid(), null, 'PLATFORM', 'pf12.probe3', 'probe', 'EMAIL', 'en', now())`), /row-level security/i));
  ok("PF-12 pass: the bypass role reads both firms' rows", Number(sql(DEMO, `begin; set local role xr_staff_bypass; select count(distinct firm_id) from platform_staff where firm_id in ('${A}','${B}'); commit;`, "xr_app")) === 2);

  // ------------------------------------------------------------------- the app's pool, the named list and the request
  const pool = new WalledPool({ connectionString: appDatabaseUrl(urlOf(DEMO), {}), max: 1, options: "-c TimeZone=UTC" }); pools.push(pool);
  const db = new PrismaClient({ adapter: new PrismaPg(pool) }); clients.push(db);
  const staffOf = () => db.platformStaff.findMany({ select: { firmId: true } });
  ok("PF-12 pass: the API's pool with no firm reads no staff", (await staffOf()).length === 0);
  const aRows = await withFirm(A, staffOf);
  ok("PF-12 pass: the API's pool as firm A reads only firm A's staff", aRows.length > 0 && aRows.every((r) => r.firmId === A), aRows.length);
  ok("PF-12 fail: the next query on the same connection with no firm reads nothing again (no firm leaks from one checkout to the next)", (await staffOf()).length === 0);
  const bStaff = sql(DEMO, `select id from platform_staff where firm_id = '${B}' limit 1`), aStaff = sql(DEMO, `select id from platform_staff where firm_id = '${A}' limit 1`);
  ok("PF-12 fail: firm A's pool reads firm B's staff member by id as not found", (await withFirm(A, () => db.platformStaff.findUnique({ where: { id: bStaff } }))) === null);
  const inTx = await withFirm(A, () => db.$transaction(async (tx) => (await tx.platformStaff.findMany({ select: { firmId: true } })).map((r) => r.firmId)));
  ok("PF-12 pass: an interactive transaction runs as the firm that opened it", inTx.length > 0 && inTx.every((f) => f === A));
  // Many at once, two firms: each sees only its own (the pool sets the firm per checkout; four connections here).
  const pool4 = new WalledPool({ connectionString: appDatabaseUrl(urlOf(DEMO), {}), max: 4, options: "-c TimeZone=UTC" }); pools.push(pool4);
  const db4 = new PrismaClient({ adapter: new PrismaPg(pool4) }); clients.push(db4);
  const mixed = await Promise.all(Array.from({ length: 40 }, (_, i) => { const f = i % 2 ? A : B; return withFirm(f, async () => ({ f, rows: await db4.platformStaff.findMany({ select: { firmId: true } }) })); }));
  ok("PF-12 pass: 40 queries at once from two firms each read only their own firm's rows", mixed.every((m) => m.rows.length > 0 && m.rows.every((r) => r.firmId === m.f)));
  const lookups = (c: PrismaClient) => Promise.all(Array.from({ length: 20 }, (_, i) => { const [f, id] = i % 2 ? [A, aStaff] : [B, bStaff]; return withFirm(f, () => c.platformStaff.findUnique({ where: { id } })); }));
  const merged = await lookups(db4);
  ok("PF-12 fail: a plain Prisma client merges 20 findUnique calls from two firms into one query, so one firm's staff read as not found", merged.some((u) => !u), merged.filter((u) => !u).length);
  oneQueryPerCaller(db4);
  const uniq = await lookups(db4);
  ok("PF-12 pass: with oneQueryPerCaller (core.ts Db) the 20 calls each find their own firm's staff member", uniq.every((u) => !!u), uniq.filter((u) => !u).length);
  const { Db } = await import("../api/src/core.ts");
  ok("PF-12 pass: the API's client (core.ts Db) sends each call outside a transaction on its own", ((new Db() as unknown as { _requestHandler: { dataloader: { options: { batchBy(r: object): unknown } } } })._requestHandler.dataloader.options.batchBy({ protocolQuery: { modelName: "PlatformStaff", action: "findUnique", query: { arguments: { where: { id: aStaff } }, selection: { $scalars: true } } } })) === undefined);

  const lines: string[] = [];
  const was = onBypassLine((use, route) => lines.push(`${use} ${route ?? "-"}`));
  ok("PF-12 fail: a bypass use that is not on the named list is refused before any query", await asBypass("platform.everything", staffOf).then(() => false, (e) => e instanceof BypassRefused));
  ok("PF-12 fail: the guard's bypass use is refused outside a request (start-up, a job)", await asBypass("platform.identity.authenticate", staffOf).then(() => false, (e) => e instanceof BypassRefused));
  ok("PF-12 fail: a door's use is refused inside a job's scope (a job runs as its firm, never on a door's bypass)", await withFirm(A, () => asBypass("fo.sales.web-form", staffOf)).then(() => false, (e) => e instanceof BypassRefused));
  ok("PF-12 pass: a door's use runs on a direct call with no scope (a suite calling the service with its own client)", (await asBypass("fo.sales.web-form", staffOf)).length >= 2);
  const caseRoute = { method: "GET", path: "/runtime/cases" }, staffRoute = { method: "GET", path: "/api/platform/me" };
  ok("PF-12 fail: the bypass role is refused on a route not on its list (a page outside /api/)", await inRequest(caseRoute, () => asBypass("platform.identity.authenticate", staffOf)).then(() => false, (e) => e instanceof BypassRefused));
  ok("PF-12 fail: the sign-in door's bypass is refused on a staff route, and the web form's on the booking page (each use only on its own routes)",
    await inRequest({ method: "GET", path: "/api/front-office/leads" }, () => asBypass("platform.identity.sign-in", staffOf)).then(() => false, (e) => e instanceof BypassRefused)
    && await inRequest({ method: "GET", path: "/api/public/firms/sample-firm/book/free/slots" }, () => asBypass("fo.sales.web-form", staffOf)).then(() => false, (e) => e instanceof BypassRefused));
  const both = await inRequest(staffRoute, () => asBypass("platform.identity.authenticate", staffOf));
  ok("PF-12 pass: on a route on its list the bypass reads both firms", new Set(both.map((r) => r.firmId)).size >= 2);
  ok("PF-12 pass: every bypass use writes one line with the use and the route; a refused one writes none", lines.length === 2 && lines[0] === "fo.sales.web-form -" && lines[1] === "platform.identity.authenticate GET /api/platform/me", lines);
  onBypassLine(was);
  const req = { method: "GET", path: "/api/front-office/leads" };
  setRequestFirm(req, A.toUpperCase());
  const inReq = await inRequest(req, async () => ({ firm: currentFirm(), rows: await staffOf() }));
  ok("PF-12 pass: a handler runs as the firm the guard set (setRequestFirm, in lower case)", inReq.firm === A && inReq.rows.length > 0 && inReq.rows.every((r) => r.firmId === A));
  ok("PF-12 fail: a request whose guard set no firm reads nothing", (await inRequest({ method: "GET", path: "/api/front-office/leads" }, staffOf)).length === 0);
  ok("PF-12 fail: the guard cannot set a firm id that is not a uuid", refused(() => setRequestFirm({}, "sample-firm"), /not a firm id/));

  // ---------------------------------------------------------------------------- the real API: start-up refusal and pass
  const start = (env: Record<string, string>) => new Promise<{ code: number | null; out: string }>((resolve) => {
    const p = spawn(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), join(STUDIO, "api", "src", "main.ts")],
      { cwd: STUDIO, env: { ...process.env, DATABASE_URL: urlOf(EMPTY), STUDIO_PORT: String(46000 + (process.pid % 1000)), STUDIO_VAR: join(STUDIO, "var", `pf12-check-${process.pid}`), ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const done = (code: number | null) => { clearTimeout(t); resolve({ code, out }); };
    const t = setTimeout(() => { p.kill("SIGKILL"); done(-1); }, 120_000);
    const seen = (b: Buffer) => { out += b.toString(); if (/Product Studio on http/.test(out)) { p.kill("SIGTERM"); } };
    p.stdout.on("data", seen); p.stderr.on("data", seen); p.on("exit", (code) => done(code));
  });
  const asOwner = await start({ APP_DATABASE_URL: urlOf(EMPTY) });
  ok("PF-12 fail: the API refuses to start when it connects as the table owner (it names the reason)", !/Product Studio on http/.test(asOwner.out) && /PF-12: the API refuses to start/.test(asOwner.out) && asOwner.code !== 0, asOwner.out.slice(-400));
  const asApp1 = await start({});
  ok("PF-12 pass: the API starts as xr_app (DATABASE_URL's user changed to xr_app)", /Product Studio on http/.test(asApp1.out) && !/refuses to start/.test(asApp1.out), asApp1.out.slice(-400));
} finally {
  for (const c of clients) await c.$disconnect().catch(() => undefined);
  for (const p of pools) await p.end().catch(() => undefined);
  for (const db of [EMPTY, DEMO, BARE]) { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db]); } catch { /* prune-test-dbs.sh */ } }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
