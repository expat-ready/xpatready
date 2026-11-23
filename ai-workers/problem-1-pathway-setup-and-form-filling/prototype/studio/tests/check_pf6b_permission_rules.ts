// PF-6b (BACKLOG row PF-6b rows rev 16.10, narrowed by Lead B's brief rulings 1-4; SA-6-24, SA-6-27, SA-6-12, SA-6-13;
// P-600, P-606, rows rev 16.7 and 16.11 (a)): own versus all, and money and licence apart, made checkable. One named case
// per Done when line (DW1-DW8), each with its passing and failing half:
//   DW1 every role-permission key and every declared key has a catalogue row · DW2 scope and class follow ruling 1 ·
//   DW3 no duty or bundle hands out a MONEY key (the start-up check) · DW4 a role bringing MONEY keys writes its own audit
//   line · DW5 a LICENCE route needs the licence record (403 NOT_LICENSED) · DW6 the own/all sweep of every @OwnOrAll
//   route, from the SWEEP table · DW7 a marked route with no SWEEP entry fails · DW8 the migration in a parallel world.
// One scratch database, demo-shaped (rev 16.7): every migration before PF-6b's, the Sample firms and staff, PF-6b's
// migration (checked right after it), then every later one and FO-1a's front-office seed. A small Nest app is built from
// the feature's own classes (local sign-in stand-in, test clock) plus one test-only LICENCE route. No server, no browser,
// no model call (US$0). The database is dropped at the end.
//   tsx studio/tests/check_pf6b_permission_rules.ts
import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants.js";
import { APP_GUARD, NestFactory, Reflector } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261115120000_pf6b_permission_catalogue";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf6b_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `pf6b-check-${process.pid}`);

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const psql = (args: string[]) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => psql(["-Atc", q]);
const refused = (q: string, re: RegExp) => { try { sql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
const throwsLike = async (f: () => unknown, re: RegExp) => { try { await f(); return false; } catch (e) { return re.test(String(e)); } };
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";   // PF-24w: required, no default
const { Db } = await import("../api/src/core.ts");
const { registerFeatures } = await import("../api/src/features.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { EVERYONE_SEES_ALL, writeSetting } = await import("../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../api/src/platform/identity/audit.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { Signing } = await import("../api/src/front-office/signing/service.ts");
const { SigningController } = await import("../api/src/front-office/signing/routes.ts");
const { AnyDocuments } = await import("../api/src/front-office/signing/any-document/service.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard, controllerRoutes } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { DUTY_KEYS, NOT_LICENSED, OwnOrAll, PermissionKeys } = await import("../api/src/platform/identity/keys.ts");
const { assertNoBundleHandsOutMoney, catalogueMismatches, readCatalogue, uncatalogued } = await import("../api/src/platform/identity/catalogue.ts");
const { buildDocx } = await import("../api/src/front-office/retainers/docx.ts");
const { Retainers } = await import("../api/src/front-office/retainers/service.ts");
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const { Leads } = await import("../api/src/front-office/sales/leads.ts");
const { Prospects } = await import("../api/src/front-office/sales/prospects.ts");
const { Timeline } = await import("../api/src/front-office/sales/timeline.ts");
type StaffContext = import("../api/src/platform/identity/keys.ts").StaffContext;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const apps: { close(): Promise<void> }[] = [];
try {
  // ------------------------------------------------------------------ DW8: the migration in a parallel world (rev 16.7)
  const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
  const before = all.filter((d) => d < NEW);
  ok(`PF-6b DW8 pass: the migration has its own stamp, later than every one before it and unique (newest before it: ${before.at(-1)})`,
    all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && before.at(-1)! >= "20261115013000_fo13_compliance_tables");
  for (const d of before) psql(["-f", join(MIG, d, "migration.sql")]);
  await seedSampleFirms(db);   // demo-shaped rows before PF-6b's migration: the Sample firms, staff, grants, licences
  ok("PF-6b DW8 fail: before PF-6b's migration there is no catalogue table", sql(`select to_regclass('platform_permission_key') is null`) === "t");
  psql(["-f", join(MIG, NEW, "migration.sql")]);
  const distinct = Number(sql(`select count(distinct permission_key) from platform_role_permission`));
  ok(`PF-6b DW8 pass: right after its own migration, one catalogue row per distinct role-permission key (${distinct}), no role-permission row changed`,
    Number(sql(`select count(*) from platform_permission_key`)) === distinct && distinct >= 233
    && sql(`select count(*) from platform_role_permission rp left join platform_permission_key k on k.key = rp.permission_key where k.key is null`) === "0");
  for (const d of all.filter((x) => x > NEW)) psql(["-f", join(MIG, d, "migration.sql")]);
  await seedSampleFirmsFrontOffice(db);
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, "prisma.config.ts");
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(DB))} } });\n`);
  const diff = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  ok("PF-6b DW8 pass: after every migration, migrate diff names nothing of the catalogue (schema file and migration agree)",
    (diff.status === 0 || diff.status === 2) && !/platform_permission_key|PlatformPermission/.test(diff.stdout), `${diff.stdout}${diff.stderr}`.slice(0, 400));

  // ---------------------------------------------------------------------------- DW1: every key has a catalogue row
  const rows = await readCatalogue(db);
  const roleKeys = sql(`select distinct permission_key from platform_role_permission`).split("\n");
  class Features {}
  await registerFeatures(Features);
  const controllers: unknown[] = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, Features) ?? [];
  const routes = controllerRoutes(controllers, new Reflector());
  const declared = routes.flatMap((r) => (r.access?.kind === "keys" ? r.access.keys : []));
  ok(`PF-6b DW1 pass: every role-permission key (${roleKeys.length}) and every key a route declares (${new Set(declared).size}, ${routes.length} platform routes) has a catalogue row`,
    declared.length > 20 && uncatalogued(roleKeys, rows).length === 0 && uncatalogued(declared, rows).length === 0, { role: uncatalogued(roleKeys, rows), declared: uncatalogued(declared, rows) });
  @Controller("api/front-office") class UncataloguedProbe { @Get("pf6b-uncatalogued") @PermissionKeys("agent/made-up:thing") x() { return 1; } }
  const shown = uncatalogued(controllerRoutes([UncataloguedProbe], new Reflector()).flatMap((r) => (r.access?.kind === "keys" ? r.access.keys : [])), rows);
  ok("PF-6b DW1 fail: a declared key with no catalogue row is named (shown once with a test route, then removed)", shown.join() === "agent/made-up:thing", shown);

  // ------------------------------------------------------------------------------ DW2: scope and class, ruling 1
  const byKey = new Map(rows.map((r) => [r.key, r]));
  ok("PF-6b DW2 pass: every row's scope and class are as ruling 1 (OWN/ALL by suffix; LICENCE = the 3 sign-off keys; MONEY = the money areas + expense:create)",
    catalogueMismatches(rows).length === 0 && rows.filter((r) => r.scope === "OWN").length === rows.filter((r) => r.scope === "ALL").length
    && rows.filter((r) => r.class === "LICENCE").map((r) => r.key).sort().join() === [...DUTY_KEYS.represent].sort().join()
    && byKey.get("agent/invoice:issue")?.class === "MONEY" && byKey.get("agent/expense:create")?.class === "MONEY" && byKey.get("agent/expense:list")?.class === "GENERAL"
    && byKey.get("agent/prospect:view.all")?.scope === "ALL" && byKey.get("agent/prospect:view.own")?.scope === "OWN" && byKey.get("agent/retainer:show")?.scope === "NONE", catalogueMismatches(rows));
  ok("PF-6b DW2 fail: a view.all key classed NONE is named by the check",
    catalogueMismatches(rows.map((r) => (r.key === "agent/case:view.all" ? { ...r, scope: "NONE" as const } : r))).join() === "agent/case:view.all: NONE/GENERAL, expected ALL/GENERAL");
  ok("PF-6b DW2 fail: the database refuses it too (a scope that does not follow the key's suffix)",
    refused(`update platform_permission_key set scope = 'NONE' where key = 'agent/case:view.all'`, /platform_permission_key_scope/)
    && refused(`insert into platform_permission_key values ('agent/x:view.own', 'ALL', 'GENERAL')`, /platform_permission_key_scope/));

  // --------------------------------------------------------- the app: identity, the guard and a test LICENCE route
  @Controller("api/front-office") class LicenceProbe { @Get("pf6b-licence-probe") @PermissionKeys("agent/case:form-approve") approve() { return { ok: true }; } }
  const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
  const local = new LocalIdentity("pf6b-check-signing-key-0123456789abcdef", () => clock.now());
  const makeApp = async (): Promise<string> => {
    @Module({ controllers: [PlatformIdentityController, LicenceProbe] as never[], providers: [Db, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }] as never[] }) class TestApp {}
    const app = await NestFactory.create(TestApp, { logger: false });
    apps.push(app);
    await app.listen(0, "127.0.0.1");
    return `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  };

  // ----------------------------------------------------------------------------- DW3: no bundle hands out money
  ok("PF-6b DW3 pass: no duty or bundle in keys.ts hands out a MONEY key, so the app starts",
    !(await throwsLike(() => assertNoBundleHandsOutMoney(DUTY_KEYS, rows), /./)) && rows.some((r) => r.class === "MONEY"));
  ok("PF-6b DW3 fail: a bundle carrying a MONEY key is refused, naming it", await throwsLike(() => assertNoBundleHandsOutMoney({ ...DUTY_KEYS, billing_run: ["agent/invoice:issue"] }, rows), /billing_run: agent\/invoice:issue/));
  (DUTY_KEYS as Record<string, readonly string[]>).test_bundle = ["agent/case:edit", "agent/payment:record"];
  ok("PF-6b DW3 fail: a test bundle that adds a MONEY key to keys.ts stops the app's start-up (the guard's start-up check)",
    await throwsLike(() => makeApp(), /hands out a money key.*test_bundle: agent\/payment:record/));
  delete (DUTY_KEYS as Record<string, readonly string[]>).test_bundle;
  const BASE = await makeApp();
  const call = async (method: string, path: string, token: string, body?: unknown) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) as any };
  };
  const tokenOf = async (actorId: string) => {
    const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId, secondStep: true }) });
    const b = await r.json() as { token?: string }; if (!b.token) throw new Error(`sign-in ${actorId}: ${JSON.stringify(b)}`); return b.token;
  };
  const staff = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}'`);
  const R = staff("user-R"), T = staff("user-T"), O = staff("user-O"), S = staff("user-S");
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const tR = await tokenOf("user-R");

  // ------------------------------------------------------------------------ DW4: the separate money-keys audit line
  const moneyLines = (who: string) => sql(`select coalesce(string_agg(detail::text, '|'), '') from audit_event where action = 'platform.staff.money_keys_granted' and entity_key = '${who}'`);
  const bfMoney = sql(`select string_agg(k.key, ',' order by k.key) from platform_role_permission rp join platform_permission_key k on k.key = rp.permission_key where rp.role = 'BILLING_FINANCE' and k.class = 'MONEY'`);
  const toBF = await call("PATCH", `/api/platform/staff/${O}/roles`, tR, { roles: ["CASE_OFFICER", "READ_ONLY", "BILLING_FINANCE"] });
  const line = moneyLines(O);
  ok("PF-6b DW4 pass: assigning Billing/Finance (with Read-only) writes its own money-keys audit line naming those keys and only the role that brings them (names only), beside the roles line",
    toBF.status === 200 && !!bfMoney && line !== "" && !line.includes("|") && (JSON.parse(line).moneyKeys as string[]).join() === bfMoney && JSON.parse(line).roles.join() === "BILLING_FINANCE"
    && sql(`select count(*) from audit_event where action = 'platform.staff.roles_changed' and entity_key = '${O}'`) === "1", { toBF, line, bfMoney });
  const toRO = await call("PATCH", `/api/platform/staff/${T}/roles`, tR, { roles: ["CASE_MANAGER", "READ_ONLY"] });
  ok("PF-6b DW4 fail: assigning Read-only (no money key) writes no money-keys line",
    toRO.status === 200 && moneyLines(T) === "" && sql(`select count(*) from audit_event where action = 'platform.staff.roles_changed' and entity_key = '${T}'`) === "1", { toRO, t: moneyLines(T) });
  await call("PATCH", `/api/platform/staff/${O}/roles`, tR, { roles: ["CASE_OFFICER"] });
  await call("PATCH", `/api/platform/staff/${T}/roles`, tR, { roles: ["CASE_MANAGER"] });

  // ---------------------------------------------------------------------------------- DW5: licence apart (guard)
  // The licence record is moved aside and back inside the database: a licence number never passes through this process (AG-1-31).
  sql(`create table pf6b_licence_aside as select * from platform_staff_credential where staff_id = '${T}'; delete from platform_staff_credential where staff_id = '${T}'`);
  const tT = await tokenOf("user-T");
  const noLicence = await call("GET", "/api/front-office/pf6b-licence-probe", tT);
  ok("PF-6b DW5 fail: an unlicensed Case Manager holding agent/case:form-approve gets 403 NOT_LICENSED, \"Only a licensed consultant can do this\"",
    noLicence.status === 403 && noLicence.body?.code === "NOT_LICENSED" && noLicence.body?.detail === NOT_LICENSED && NOT_LICENSED === "Only a licensed consultant can do this", noLicence);
  sql(`insert into platform_staff_credential select * from pf6b_licence_aside; drop table pf6b_licence_aside`);
  const licensed = await call("GET", "/api/front-office/pf6b-licence-probe", tT);
  ok("PF-6b DW5 pass: once their licence record exists, the same person and route answer 200", licensed.status === 200 && licensed.body?.ok === true, licensed);
  // Fail closed (break m1, review m2): a hand-edited catalogue never switches the licence check off.
  sql(`update platform_permission_key set class = 'GENERAL' where key = 'agent/case:form-approve'`);
  ok("PF-6b DW5 fail: a catalogue whose sign-off key was edited to GENERAL stops the start-up, naming the key",
    await throwsLike(() => makeApp(), /catalogue disagrees.*agent\/case:form-approve: NONE\/GENERAL, expected NONE\/LICENCE/));
  sql(`update platform_permission_key set class = 'LICENCE' where key = 'agent/case:form-approve'; create table pf6b_catalogue_aside as select * from platform_permission_key; delete from platform_permission_key`);
  const emptied = await makeApp();
  sql(`create table pf6b_licence_aside as select * from platform_staff_credential where staff_id = '${T}'; delete from platform_staff_credential where staff_id = '${T}'`);
  const noRows = await (await fetch(`${emptied}/api/front-office/pf6b-licence-probe`, { headers: { authorization: `Bearer ${tT}` } })).json().catch(() => null) as { code?: string } | null;
  sql(`insert into platform_staff_credential select * from pf6b_licence_aside; drop table pf6b_licence_aside; insert into platform_permission_key select * from pf6b_catalogue_aside; drop table pf6b_catalogue_aside`);
  ok("PF-6b DW5 fail: with the catalogue rows gone, the code's own sign-off list still refuses an unlicensed holder (403 NOT_LICENSED)", noRows?.code === "NOT_LICENSED", noRows);
  const noKey = await call("GET", "/api/front-office/pf6b-licence-probe", await tokenOf("user-O"));
  ok("PF-6b DW5 pass: without the key the answer stays 403 MISSING_PERMISSION (licence never replaces the key)", noKey.status === 403 && noKey.body?.code === "MISSING_PERMISSION", noKey);

  // ------------------------------------------------------------------------------ DW6: own versus all, by sweep
  // Two staff each own a prospect: user-R owns P1, user-O owns P2; user-T is the representative of both retainers. The
  // role copy without view.all is made in this database: the Case Officer rows lose agent/prospect:view.all.
  const ctx = (staffId: string, firmId = A): StaffContext => ({ staffId, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles: [], keys: [], duties: [], authTime: 0, via: "local" });
  const svc = new Retainers(db, new LocalFiles(join(WORK, "files")), { now: () => clock.now() });
  const stage = sql(`select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'`);
  const prospect = (n: number, owner: string) => {
    const P = u(n), L = u(n + 1), id = u(n + 2);
    sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${P}', '${A}', 'Client ${n}', 'Sample', 'client${n}@example.com', 'test', now())`);
    sql(`insert into fo_lead (id, firm_id, person_id, door, source, created_by, updated_at) values ('${L}', '${A}', '${P}', 'MANUAL', 'WEBSITE', 'test', now()); update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'test' where id = '${L}'`);
    sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at) values ('${id}', '${A}', '${L}', 'INDIVIDUAL', '${stage}', '${P}', '${P}', '${owner}', 'test', now())`);
    sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) values ('${A}', '${id}', '${stage}', 'PERSON', 'test')`);
    return id;
  };
  const tpl = await svc.uploadTemplate(ctx(R), { name: "PF-6b retainer" }, { bytes: buildDocx(["Client: {client.name}", "{#fees}{label}: {amount}{/fees}"]), size: 1000 });
  const P1 = prospect(600, R), P2 = prospect(610, O);
  const X1 = (await svc.draft(ctx(R), P1, { templateId: tpl.id, representativeStaffId: T })).id;
  const X2 = (await svc.draft(ctx(O), P2, { templateId: tpl.id, representativeStaffId: T })).id;
  sql(`delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key = 'agent/prospect:view.all'`);
  const setAll = async (on: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: on, by: "system:check", workspaceId: await platformAuditWorkspaceId(db) });
  const sees = async (f: () => Promise<unknown>) => { try { return !!(await f()); } catch (e) { if ((e as { getStatus?: () => number }).getStatus?.() === 404) return false; throw e; } };
  /** The expected own/all table: who sees which record, with the firm setting on and off. */
  const EXPECT: Record<"on" | "off", Record<string, string[]>> = {
    on: { "view.all holder (user-R)": [X1, X2], "own-only role copy (user-O)": [X2], "representative (user-T)": [X1, X2], "firm B (user-S)": [] },
    off: { "view.all holder (user-R)": [X1], "own-only role copy (user-O)": [X2], "representative (user-T)": [X1, X2], "firm B (user-S)": [] },
  };
  const VIEWERS: Record<string, StaffContext> = { "view.all holder (user-R)": ctx(R), "own-only role copy (user-O)": ctx(O), "representative (user-T)": ctx(T), "firm B (user-S)": ctx(S, B) };
  type Entry = { read: (c: StaffContext, id: string) => Promise<unknown>; ids?: [string, string]; expect?: typeof EXPECT };
  // FO-2v: two open leads, L1 owned by user-R and L2 by user-O. The representative of the retainers owns no lead, so
  // leads expect the plain own-or-all table. Leads read the person's keys from the context (the guard's
  // req.platform.keys), so the sweep hands them the live grants.
  // Each lead has its own source, so the sources route (FO-4sf) is swept by whose source a person is shown.
  const SOURCE_OF: Record<string, string> = {};
  const lead = (n: number, owner: string, source: string) => {
    sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${u(n)}', '${A}', 'Client ${n}', 'Sample', 'client${n}@example.com', 'test', now())`);
    sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values ('${u(n + 1)}', '${A}', '${u(n)}', 'MANUAL', '${source}', '${owner}', 'test', now())`);
    SOURCE_OF[u(n + 1)] = source;
    return u(n + 1);
  };
  const L1 = lead(620, R, "Event (PF-6b)"), L2 = lead(630, O, "Referral (PF-6b)");
  const live = (c: StaffContext): StaffContext => ({ ...c, keys: sql(`select string_agg(distinct rp.permission_key, ',') from platform_role_grant g join platform_role_permission rp on rp.role = g.role where g.staff_id = '${c.staffId}' and g.ended_at is null`).split(",") });
  const leads = new Leads(db, {} as never), prospects = new Prospects(db, {} as never), timeline = new Timeline(db, leads, prospects);
  const LEADS: typeof EXPECT = {
    on: { "view.all holder (user-R)": [L1, L2], "own-only role copy (user-O)": [L2], "representative (user-T)": [L1, L2], "firm B (user-S)": [] },
    off: { "view.all holder (user-R)": [L1], "own-only role copy (user-O)": [L2], "representative (user-T)": [], "firm B (user-S)": [] },
  };
  const PROSPECTS: typeof EXPECT = {
    on: { "view.all holder (user-R)": [P1, P2], "own-only role copy (user-O)": [P2], "representative (user-T)": [P1, P2], "firm B (user-S)": [] },
    off: { "view.all holder (user-R)": [P1], "own-only role copy (user-O)": [P2], "representative (user-T)": [], "firm B (user-S)": [] },
  };
  // FO-6d: one document sent from each prospect, by its owner (fake adapter, the scratch file store).
  const anyDocs = new AnyDocuments(db, new LocalFiles(join(WORK, "files")), { now: () => new Date(clock.now()) });
  const pdf = { bytes: new TextEncoder().encode("%PDF-1.4\n% PF-6b sweep (Sample)\n%%EOF\n"), size: 40, name: "probe.pdf" };
  const Q1 = (await anyDocs.send(live(ctx(R)), { title: "PF-6b document 1", prospectId: P1, signerPersonIds: [u(600)] }, pdf)).id;
  const Q2 = (await anyDocs.send(live(ctx(O)), { title: "PF-6b document 2", prospectId: P2, signerPersonIds: [u(610)] }, pdf)).id;
  const K1 = await anyDocs.fileKey(live(ctx(R)), Q1, "original"), K2 = await anyDocs.fileKey(live(ctx(O)), Q2, "original");
  /** PROSPECTS' table with its two ids replaced by the records that hang on P1 and P2. */
  const byProspect = ([a, b]: [string, string]): typeof EXPECT => Object.fromEntries((["on", "off"] as const).map((k) => [k, Object.fromEntries(Object.entries(PROSPECTS[k]).map(([w, ids]) => [w, ids.map((x) => (x === P1 ? a : b))]))])) as typeof EXPECT;
  /** A send's refusal after the visibility check (422: no signer) means the prospect was seen; a 404 that it was not. */
  const refusedButSeen = async (f: () => Promise<unknown>) => { try { await f(); return true; } catch (e) { if ((e as { getStatus?: () => number }).getStatus?.() === 422) return true; throw e; } };
  /** The sweep table: every @OwnOrAll route, with how to read one record through it (DW7 fails a marked route missing here). */
  const SWEEP: Record<string, Entry> = {
    "RetainersController.read": { read: (c, id) => svc.read(c, id) },
    // FO-6 part 3: a retainer's signing state follows the retainer read (its visibility is svc.read's).
    "SigningController.state": { read: (c, id) => new SigningController(new Signing(db, new LocalFiles(join(WORK, "files"))), svc).state({ platform: c }, id) },
    "SalesController.read": { read: (c, id) => leads.read(live(c), id), ids: [L1, L2], expect: LEADS },
    "SalesController.list": { read: async (c, id) => (await leads.list(live(c), "all")).find((l) => l.id === id), ids: [L1, L2], expect: LEADS },
    // FO-2 part 3: prospects follow the leads' table (the representative of a retainer owns no prospect).
    "SalesController.prospectRead": { read: (c, id) => prospects.read(live(c), id), ids: [P1, P2], expect: PROSPECTS },
    "SalesController.prospectList": { read: async (c, id) => (await prospects.list(live(c), {})).find((p) => p.id === id), ids: [P1, P2], expect: PROSPECTS },
    // FO-2 part 4: the timelines follow their record's read (a lead's or a prospect's).
    "SalesController.leadTimeline": { read: (c, id) => timeline.lead(live(c), id), ids: [L1, L2], expect: LEADS },
    "SalesController.prospectTimeline": { read: (c, id) => timeline.prospect(live(c), id), ids: [P1, P2], expect: PROSPECTS },
    "SalesController.sources": { read: async (c, id) => (await leads.sources(live(c))).sources.includes(SOURCE_OF[id]), ids: [L1, L2], expect: LEADS },
    // FO-6d: a document sent for signature follows its prospect's read (the prospects' table), by prospect, request, file and person.
    "AnyDocumentsController.send": { read: (c, id) => refusedButSeen(() => anyDocs.send(live(c), { title: "PF-6b probe", prospectId: id, signerPersonIds: [] }, undefined)), ids: [P1, P2], expect: PROSPECTS },
    "AnyDocumentsController.list": { read: (c, id) => anyDocs.listForProspect(live(c), id), ids: [P1, P2], expect: PROSPECTS },
    "AnyDocumentsController.signers": { read: (c, id) => anyDocs.signersFor(live(c), id), ids: [P1, P2], expect: PROSPECTS },
    "AnyDocumentsController.state": { read: (c, id) => anyDocs.state(live(c), id), ids: [Q1, Q2], expect: byProspect([Q1, Q2]) },
    "AnyDocumentsController.link": { read: (c, id) => anyDocs.fileKey(live(c), id, "original"), ids: [Q1, Q2], expect: byProspect([Q1, Q2]) },
    "AnyDocumentsController.download": { read: async (c, id) => { await anyDocs.assertKeyVisible(live(c), id); return true; }, ids: [K1, K2], expect: byProspect([K1, K2]) },
    "AnyDocumentsController.personDocuments": { read: (c, id) => anyDocs.personDocuments(live(c), id), ids: [u(600), u(610)], expect: byProspect([u(600), u(610)]) },
  };
  const sweep = async (entry: Entry) => {
    const wrong: string[] = [];
    const [I1, I2] = entry.ids ?? [X1, X2], want_ = entry.expect ?? EXPECT;
    for (const setting of ["on", "off"] as const) {
      await setAll(setting === "on");
      for (const [who, c] of Object.entries(VIEWERS)) for (const id of [I1, I2]) {
        const want = want_[setting][who].includes(id), got = await sees(() => entry.read(c, id));
        if (want !== got) wrong.push(`${setting}: ${who} ${got ? "sees" : "does not see"} ${id === I1 ? "X1" : "X2"}`);
      }
    }
    await setAll(true);
    return wrong;
  };
  const marked = routes.filter((r) => r.ownOrAll);
  for (const r of marked) if (SWEEP[r.name]) { const w = await sweep(SWEEP[r.name]); ok(`PF-6b DW6 pass: ${r.name} (${r.method} ${r.path}, ${r.ownOrAll}): view.all holder sees both, own-only sees their own, the representative always sees theirs, firm B 404; the setting off makes everyone own-only`, w.length === 0, w); }
  ok("FO-2v DW2 pass: the leads list and read routes are marked @OwnOrAll(\"agent/prospect\") and swept", ["SalesController.list", "SalesController.read"].every((n) => marked.some((r) => r.name === n && r.ownOrAll === "agent/prospect")), marked);
  const leakyLeads = await sweep({ read: (_c, id) => db.foLead.findFirst({ where: { id } }), ids: [L1, L2], expect: LEADS });
  ok("FO-2v DW2 fail: a test leads route that returns another person's lead to an own-only viewer fails the sweep (shown once, then removed)",
    leakyLeads.includes("on: own-only role copy (user-O) sees X1") && leakyLeads.includes("off: view.all holder (user-R) sees X2"), leakyLeads);
  ok("PF-6b DW6 pass: the retainer show route is marked @OwnOrAll(\"agent/prospect\") and swept", marked.some((r) => r.name === "RetainersController.read" && r.ownOrAll === "agent/prospect"), marked);
  const leaky = await sweep({ read: (_c, id) => db.foRetainer.findFirst({ where: { id } }) });
  ok("PF-6b DW6 fail: a test route that returns another person's record to an OWN holder fails the sweep (shown once, then removed)",
    leaky.includes("on: own-only role copy (user-O) sees X1") && leaky.includes("off: view.all holder (user-R) sees X2") && leaky.includes("on: firm B (user-S) sees X1"), leaky);

  // ------------------------------------------------------------------------------- DW7: every marked route swept
  const unswept = (rs: { name: string; ownOrAll?: string }[]) => rs.filter((r) => r.ownOrAll && !SWEEP[r.name]).map((r) => r.name);
  ok("PF-6b DW7 pass: every route marked @OwnOrAll in the app's features has a sweep entry", marked.length >= 1 && unswept(routes).length === 0, unswept(routes));
  @Controller("api/front-office") class UnsweptProbe { @Get("pf6b-unswept") @PermissionKeys("agent/retainer:list") @OwnOrAll("agent/prospect") list() { return []; } }
  ok("PF-6b DW7: a route marked @OwnOrAll with no sweep entry fails the test, naming it", unswept(controllerRoutes([UnsweptProbe], new Reflector())).join() === "UnsweptProbe.list");
} catch (e) {
  fail++; console.log(`FAIL  the check stopped: ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);   // the apps' own pools may still hold a connection
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
