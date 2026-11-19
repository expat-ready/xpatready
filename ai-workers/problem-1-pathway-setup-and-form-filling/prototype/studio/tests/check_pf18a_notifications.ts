// PF-18a part 2 (brief design/lead-b-briefs/PF-18a.md; AG-16-10, AG-16-11, AG-16 §3.3; P-600, P-606): each person's notification switches and
// NotificationPrefsPort. Each "Done when" line of part 2 (DW5, DW7's NotificationPrefsPort share and its migration; DW6 is booking's, below when built) with a
// passing and a failing case. Two scratch databases: "empty" gets every migration (then PF-3's Sample firms); "demo" gets every migration before part 2's,
// demo-shaped rows and the Sample firms, then part 2's (rows rev 16.7). The routes run in a Nest app built from the feature's own classes beside PF-4's guard
// and the local stand-in's tokens (as check_pf18a_offices.ts). The walls are checked as xr_app (PF-12). The port's contract runs on the real adapter and on
// fakeNotificationPrefs. No server of the app, no browser, no model call (US$0). Every scratch database is dropped at the end.
//   tsx studio/tests/check_pf18a_notifications.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { notificationPrefsPortContract, type NotificationPrefsHarness } from "../ports/contracts/notification-prefs-port.contract.ts";
import { fakeNotificationPrefs, groupsFor, NotificationGroup, type GroupRule } from "../ports/notification-prefs.ts";
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261119180000_pf18a_notification_prefs";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const EMPTY = `xr_studio_pf18an_empty_${process.pid}`, DEMO = `xr_studio_pf18an_demo_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `pf18an-check-${process.pid}`);
let pass = 0, fail = 0; const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const psql = (db: string, args: string[], user = "xr_studio") => execFileSync(join(BIN, "psql"), [`postgresql://${user}@127.0.0.1:54329/${db}`, "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string, user?: string) => psql(db, ["-Atc", q], user);
const refused = (db: string, q: string, re: RegExp, user?: string) => { try { sql(db, q, user); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
const asApp = (db: string, firm: string | null, q: string) => sql(db, `begin; ${firm ? `select set_config('app.firm_id', '${firm}', true);` : ""} ${q}; commit;`, "xr_app").split("\n").filter((l) => l !== "" && l !== firm).join("\n");
const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const db of [EMPTY, DEMO]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
for (const d of all) psql(EMPTY, ["-f", join(MIG, d, "migration.sql")]);
process.env.DATABASE_URL = urlOf(EMPTY);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];
const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { GROUPS, RULES, readGroups } = await import("../api/src/platform/settings/notifications/groups.ts");
const { PrismaNotificationPrefs } = await import("../api/src/platform/settings/notifications/prefs.ts");
const { NOT_YOURS } = await import("../api/src/platform/settings/notifications/service.ts");
const feature = (await import("../api/src/features/platform-settings-personal.ts")).default;
const db = new Db();
const apps: { close(): Promise<void> }[] = [];
const local = new LocalIdentity("pf18an-check-signing-key-0123456789abcdef", () => Date.now());
type Res = { status: number; body: any };
let BASE = "";
const call = async (method: string, token?: string, body?: unknown): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}/api/platform/me/notifications`, { method, headers, body: body === undefined || method === "GET" ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};
const shown = (r: Res) => (r.body?.groups ?? []).map((g: any) => g.group).join(",");
try {
  // ------------------------------------------------------------------------------------------------ DW7: the migration
  const before = all.filter((d) => d < NEW);
  ok(`PF-18a DW7: the migration has its own stamp, later than every migration before it (P-600 (4), rows rev 16.7; newest before it: ${before.at(-1)})`, all.includes(NEW) && (before.at(-1) ?? "") < NEW && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && all.at(-1) === NEW, all.slice(-3));
  const migText = readFileSync(join(MIG, NEW, "migration.sql"), "utf8");
  const fns = [...migText.replace(/--.*$/gm, "").matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+"?([a-z_0-9]+)/gi)].map((m) => m[1]);
  ok("PF-18a DW7: every function the migration creates carries the area prefix platform_notification_pref_ (rows rev 15.2)", fns.length === 1 && fns.every((f) => /^platform_notification_pref_/.test(f)), fns);
  ok("PF-18a DW7: the migration only adds (no DROP, no ALTER of another table, no UPDATE or DELETE of rows)", !/\b(DROP|DELETE FROM|UPDATE\s+"?[a-z_]+"?\s+SET|TRUNCATE)\b/i.test(migText.replace(/--.*$/gm, "")) && [...migText.replace(/--.*$/gm, "").matchAll(/ALTER TABLE "([a-z_]+)"/g)].every((m) => m[1] === "platform_notification_preference"));
  const checkList = (/group_check" CHECK \("group" IN \(([^)]*)\)\)/.exec(migText)?.[1] ?? "").split(",").map((s) => s.trim().replace(/'/g, ""));
  ok("PF-18a DW5/DW7: the database's group list is PF-18np's NotificationGroup, the same eight in the same order (never a second list that drifts)", JSON.stringify(checkList) === JSON.stringify(NotificationGroup.options), checkList);
  const staffBody = (/\nmodel PlatformStaff \{\n([\s\S]*?)\n\}/.exec(readFileSync(join(SCHEMA, "platform.prisma"), "utf8"))?.[1] ?? "").split("\n").map((l) => l.trim());
  const slot = staffBody.indexOf("// back-relation slot: offices (PF-18a)");
  ok("PF-18a DW7 (P-600): platform.prisma gains one back-relation line, under PF-18a's own slot in PlatformStaff", slot >= 0 && /^office PlatformStaffOffice\?/.test(staffBody[slot + 1]) && /^notificationPrefs PlatformNotificationPreference\[\]/.test(staffBody[slot + 2]) && staffBody.filter((l) => /PlatformNotificationPreference/.test(l)).length === 1, staffBody.slice(slot, slot + 3));
  ok("PF-18a DW7 fail: the migration does not apply twice", refused(EMPTY, migText, /already exists/));
  for (const d of before) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
  ok("PF-18a DW7 fail: before the migration there is no preference table", sql(DEMO, `select count(*) from pg_tables where tablename = 'platform_notification_preference'`) === "0");
  { process.env.DATABASE_URL = urlOf(DEMO); const pre = new Db(); await seedSampleFirms(pre); await pre.$disconnect(); process.env.DATABASE_URL = urlOf(EMPTY); }
  const demoRows = `select (select count(*) from platform_firm) || ':' || (select count(*) from platform_staff) || ':' || (select count(*) from platform_role_grant) || ':' || (select count(*) from platform_firm_setting) || ':' || (select count(*) from audit_event)`;
  const demoBefore = sql(DEMO, demoRows);
  psql(DEMO, ["-f", join(MIG, NEW, "migration.sql")]);
  ok("PF-18a DW7 pass: on a demo-data copy the migration leaves every row as it was and writes no preference (the defaults need none)", sql(DEMO, demoRows) === demoBefore && sql(DEMO, "select count(*) from platform_notification_preference") === "0", [demoBefore, sql(DEMO, demoRows)]);
  const prefsDiff = (dbName: string): string[] => {
    mkdirSync(WORK, { recursive: true });
    const cfg = join(WORK, `prisma.${dbName}.config.ts`);
    writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(dbName))} } });\n`);
    const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--script"], { cwd: STUDIO, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`migrate diff: ${r.stdout}${r.stderr}`);
    return `${r.stdout}`.split("\n").filter((l) => /platform_notification_preference/.test(l));
  };
  ok("PF-18a DW7 pass: on the empty and the demo-data copies, migrate diff names nothing for the preference table (schema and migration agree)", prefsDiff(EMPTY).length === 0 && prefsDiff(DEMO).length === 0, [prefsDiff(EMPTY), prefsDiff(DEMO)]);

  // ------------------------------------------------------------------------------------------------ DW5: the §3.3 data
  const pack = JSON.parse(readFileSync(join(STUDIO, "samples", "notification-groups.json"), "utf8"));
  ok("PF-18a DW5: the data cites AG-16 v1.24 §3.3 (AG-16-10, AG-16-11), the snapshot and the date read", pack.source.section === "§3.3" && /AG-16-firm-settings-and-integrations_v1\.24/.test(pack.source.document) && pack.source.requirements.includes("AG-16-10") && /^\d{4}-\d{2}-\d{2}$/.test(pack.source.read));
  const defaults = GROUPS.map((g) => `${g.number}:${g.group}:${g.defaults.inApp ? "A" : "a"}${g.defaults.email ? "E" : "e"}`).join(" ");
  ok("PF-18a DW5 pass: the defaults equal §3.3's: in-app on for everything, email on for groups 1-8 (group 7's per-item email-off items listed for the sender)",
    defaults === "1:WORK_HANDED_TO_ME:AE 2:NEEDS_YOU:AE 3:MY_DEADLINES:AE 4:CLIENT_MESSAGED_ME:AE 5:MENTIONS:AE 6:TEAM_WATCH:AE 7:PAYMENTS:AE 8:FIRM_AND_CONNECTIONS:AE"
    && JSON.stringify(GROUPS[6].emailNeverItems) === JSON.stringify(["Payment received", "Invoice sent", "Refund", "Dunning escalation"]), defaults);
  const who = GROUPS.map((g) => g.whoSeesIt.kind === "everyone" ? "all" : g.whoSeesIt.kind === "key" ? g.whoSeesIt.key : g.whoSeesIt.roles.join("+")).join(" ");
  ok("PF-18a DW5 pass: who sees each group equals §3.3's (1-5 everyone; 6 agent/case:assign; 7 agent/invoice:list; 8 Owner and Admin)", who === "all all all all all agent/case:assign agent/invoice:list OWNER+ADMIN", who);
  const without = { ...pack, groups: pack.groups.filter((g: any) => g.group !== "MENTIONS") }, twice = { ...pack, groups: [...pack.groups, pack.groups[0]] }, invented = { ...pack, groups: [...pack.groups.slice(1), { ...pack.groups[0], group: "DIGEST" }] };
  const throws = (raw: unknown) => { try { readGroups(raw); return false; } catch { return true; } };
  ok("PF-18a DW5 fail: data missing a group, naming one twice, or inventing one (a digest) is refused at start", throws(without) && throws(twice) && throws(invented) && !throws(pack));

  // ------------------------------------------------------------------------------------------------ DW5: the routes
  await seedSampleFirms(db);
  const firmA = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-firm" } })).id, firmB = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-solo" } })).id;
  type Role = "OWNER" | "ADMIN" | "CASE_MANAGER" | "CASE_OFFICER" | "BILLING_FINANCE" | "READ_ONLY";
  let n = 0;
  const person = async (firmId: string, roles: Role[]) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `p${++n}@pf18an.example.com`, displayName: `Sample ${n}`, actorId: `pf18an-${n}` } });
    for (const role of roles) await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role, grantedBy: "seed:pf18an" } });
    return { id: s.id, token: local.issue(s.id, { authTimeMs: Date.now() - 60_000, secondStep: true }) };
  };
  const owner = await person(firmA, ["OWNER"]), admin = await person(firmA, ["ADMIN"]), manager = await person(firmA, ["CASE_MANAGER"]), officer = await person(firmA, ["CASE_OFFICER"]),
    billing = await person(firmA, ["BILLING_FINANCE"]), reader = await person(firmA, ["READ_ONLY"]), ownerB = await person(firmB, ["OWNER"]);
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, PlatformClock, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, ...feature.providers];
  @Module({ controllers: feature.controllers as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false }); await app.listen(0, "127.0.0.1"); apps.push(app);
  BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const prefs = new PrismaNotificationPrefs(db);

  const views = Object.fromEntries(await Promise.all(Object.entries({ owner, admin, manager, officer, billing, reader }).map(async ([k, p]) => [k, await call("GET", p.token)])));
  ok("PF-18a DW5 pass: all six roles may read their own settings (agent/notification:manage-preferences on every starter role)", Object.values(views).every((r: Res) => r.status === 200), Object.fromEntries(Object.entries(views).map(([k, r]) => [k, (r as Res).status])));
  ok("PF-18a DW5 pass: the Owner sees all eight groups, in §3.3's order, each with its default switches and nothing saved", shown(views.owner) === NotificationGroup.options.join(",") && views.owner.body.groups.every((g: any) => g.inApp && g.email && !g.saved && g.label), views.owner.body);
  ok("PF-18a DW5 fail: a Case Officer does not see Team watch (no agent/case:assign) nor Firm and connections (not Owner or Admin); sees Payments (holds agent/invoice:list)", shown(views.officer) === "WORK_HANDED_TO_ME,NEEDS_YOU,MY_DEADLINES,CLIENT_MESSAGED_ME,MENTIONS,PAYMENTS", shown(views.officer));
  ok("PF-18a DW5 fail: a Read only person sees groups 1-5 only (no Team watch, no Payments, no Firm and connections)", shown(views.reader) === "WORK_HANDED_TO_ME,NEEDS_YOU,MY_DEADLINES,CLIENT_MESSAGED_ME,MENTIONS", shown(views.reader));
  ok("PF-18a DW5 pass: a Case Manager sees Team watch and Payments, not Firm and connections; Billing / Finance sees Payments, not Team watch; an Admin sees all eight",
    shown(views.manager) === "WORK_HANDED_TO_ME,NEEDS_YOU,MY_DEADLINES,CLIENT_MESSAGED_ME,MENTIONS,TEAM_WATCH,PAYMENTS" && shown(views.billing) === "WORK_HANDED_TO_ME,NEEDS_YOU,MY_DEADLINES,CLIENT_MESSAGED_ME,MENTIONS,PAYMENTS" && shown(views.admin) === NotificationGroup.options.join(","), [shown(views.manager), shown(views.billing), shown(views.admin)]);
  ok("PF-18a DW5 pass: security emails are shown on and not switchable", views.reader.body.security?.email === true && views.reader.body.security.switchable === false && /new sign-in, password change/.test(views.reader.body.security.label), views.reader.body.security);
  ok("PF-18a DW5 fail: no token → 401", (await call("GET")).status === 401 && (await call("PUT", undefined, { groups: [{ group: "MENTIONS", inApp: true, email: false }] })).status === 401);

  const off = await call("PUT", officer.token, { groups: [{ group: "MENTIONS", inApp: true, email: false }] });
  ok("PF-18a DW5 pass: a person turns email off for Mentions; the answer shows it saved, in-app still on", off.status === 200 && off.body.groups.find((g: any) => g.group === "MENTIONS")?.email === false && off.body.groups.find((g: any) => g.group === "MENTIONS").inApp === true && off.body.groups.find((g: any) => g.group === "MENTIONS").saved === true, off.body);
  ok("PF-18a DW5 pass: then allows(…, MENTIONS, EMAIL) is false and IN_APP still true; another group keeps its email", !(await prefs.allows(firmA, officer.id, "MENTIONS", "EMAIL")) && await prefs.allows(firmA, officer.id, "MENTIONS", "IN_APP") && await prefs.allows(firmA, officer.id, "NEEDS_YOU", "EMAIL"));
  ok("PF-18a DW5 fail: one person's switch never moves another's (the Owner's Mentions email stays on)", await prefs.allows(firmA, owner.id, "MENTIONS", "EMAIL"));
  const allOff = await call("PUT", reader.token, { groups: GROUPS.slice(0, 5).map((g) => ({ group: g.group, inApp: false, email: false })) });
  ok("PF-18a DW5 pass: a security email is allowed whatever the switches (every switch of the Read only person off)", allOff.status === 200 && await prefs.allows(firmA, reader.id, "SECURITY", "EMAIL") && !(await prefs.allows(firmA, reader.id, "NEEDS_YOU", "EMAIL")) && !(await prefs.allows(firmA, reader.id, "NEEDS_YOU", "IN_APP")));
  const countRows = () => sql(EMPTY, `select count(*) from platform_notification_preference where staff_id = '${officer.id}'`);
  const rowsBefore = countRows();
  const notMine = await call("PUT", officer.token, { groups: [{ group: "MENTIONS", inApp: false, email: false }, { group: "TEAM_WATCH", inApp: true, email: true }] });
  ok("PF-18a DW5 fail: a person cannot set a group that cannot reach them (a Case Officer's Team watch) → 400, nothing written, not even the other group", notMine.status === 400 && notMine.body.detail === NOT_YOURS && countRows() === rowsBefore && await prefs.allows(firmA, officer.id, "MENTIONS", "IN_APP"), notMine.body);
  sql(EMPTY, `insert into platform_notification_preference (staff_id, firm_id, "group", in_app, email, updated_at) values ('${reader.id}', '${firmA}', 'TEAM_WATCH', true, true, now())`);
  ok("PF-18a DW5 fail (AG-16-10 test 6): a person without agent/case:assign gets nothing from Team watch, even with a row stored for it; the holder does", !(await prefs.allows(firmA, reader.id, "TEAM_WATCH", "IN_APP")) && !(await prefs.allows(firmA, reader.id, "TEAM_WATCH", "EMAIL")) && await prefs.allows(firmA, manager.id, "TEAM_WATCH", "EMAIL") && !shown(await call("GET", reader.token)).includes("TEAM_WATCH"));
  ok("PF-18a DW5 fail (AG-16-10 tests 7, 8): Payments reaches no one without agent/invoice:list; Firm and connections no Case Officer", !(await prefs.allows(firmA, reader.id, "PAYMENTS", "IN_APP")) && await prefs.allows(firmA, billing.id, "PAYMENTS", "EMAIL") && !(await prefs.allows(firmA, officer.id, "FIRM_AND_CONNECTIONS", "IN_APP")) && await prefs.allows(firmA, owner.id, "FIRM_AND_CONNECTIONS", "EMAIL"));
  const bad = [{ groups: [{ group: "SECURITY", inApp: false, email: false }] }, { groups: [{ group: "DIGEST", inApp: true, email: true }] }, { groups: [] }, { groups: [{ group: "MENTIONS", inApp: "no", email: true }] },
    { groups: [{ group: "MENTIONS", inApp: true, email: true }, { group: "MENTIONS", inApp: false, email: false }] }, { groups: [{ group: "MENTIONS", inApp: true, email: true, firmCeiling: true }] }, { staffId: owner.id, groups: [{ group: "MENTIONS", inApp: true, email: true }] }, "x"];
  const badRes = await Promise.all(bad.map((b) => call("PUT", officer.token, b)));
  ok("PF-18a DW5 fail: a security switch, an unknown group (a digest), no group, a non-boolean, a group twice, an unknown field or another person's id → 400, nothing written", badRes.every((r) => r.status === 400) && countRows() === rowsBefore, badRes.map((r) => r.status));
  // Own only: firm B's Owner saves; firm A's rows and allows() are untouched; asked as firm B, firm A's person gets nothing.
  await call("PUT", ownerB.token, { groups: [{ group: "MENTIONS", inApp: false, email: false }] });
  ok("PF-18a DW5 fail (own only): firm B's save writes only its own person's row; asked as firm B, firm A's person is allowed nothing", sql(EMPTY, `select count(*) from platform_notification_preference where firm_id = '${firmB}'`) === "1" && await prefs.allows(firmA, owner.id, "MENTIONS", "IN_APP") && !(await prefs.allows(firmB, owner.id, "NEEDS_YOU", "IN_APP")));
  await db.platformStaff.update({ where: { id: admin.id }, data: { status: "DEACTIVATED" } });
  ok("PF-18a DW5 fail: a deactivated person is allowed nothing (security email included)", !(await prefs.allows(firmA, admin.id, "NEEDS_YOU", "IN_APP")) && !(await prefs.allows(firmA, admin.id, "SECURITY", "EMAIL")));
  // The breaker's two parallel PUTs: they queue on the person; the end state is one of the two whole saves, never a mix.
  const s1 = { groups: [{ group: "NEEDS_YOU", inApp: true, email: false }, { group: "MY_DEADLINES", inApp: true, email: false }] }, s2 = { groups: [{ group: "NEEDS_YOU", inApp: false, email: true }, { group: "MY_DEADLINES", inApp: false, email: true }] };
  let mixed = 0;
  for (let i = 0; i < 5; i++) {
    const rs = await Promise.all([call("PUT", owner.token, s1), call("PUT", owner.token, s2)]);
    const st = sql(EMPTY, `select string_agg("group" || '=' || (case when in_app then 't' else 'f' end) || '/' || (case when email then 't' else 'f' end), ',' order by "group") from platform_notification_preference where staff_id = '${owner.id}' and "group" in ('NEEDS_YOU', 'MY_DEADLINES')`);
    if (!rs.every((r) => r.status === 200) || !["MY_DEADLINES=t/f,NEEDS_YOU=t/f", "MY_DEADLINES=f/t,NEEDS_YOU=f/t"].includes(st)) mixed++;
  }
  ok("PF-18a DW5 pass (breaker): two saves at once, five times, each end as one whole save (both 200, never half of each)", mixed === 0, mixed);
  let outside = ""; try { await withFirm(firmB, () => prefs.allows(firmA, owner.id, "NEEDS_YOU", "IN_APP")); } catch (e) { outside = String((e as Error).message); }
  ok("PF-18a fail: the adapter asked for firm A under firm B's scope refuses (never a silent no that drops notices); in firm A's own scope it answers", /not readable here/.test(outside) && (await withFirm(firmA, () => prefs.allows(firmA, owner.id, "MENTIONS", "IN_APP"))) === true, outside);
  ok("PF-18a fail: an unknown group or channel is a programming error (throws), not a quiet false", await prefs.allows(firmA, owner.id, "DIGEST" as never, "EMAIL").then(() => false, () => true) && await prefs.allows(firmA, owner.id, "MENTIONS", "SMS" as never).then(() => false, () => true));

  // ------------------------------------------------------------------------------------------------ the database's rules and walls
  const ins = (staff: string, firm: string, group: string) => `insert into platform_notification_preference (staff_id, firm_id, "group", in_app, email, updated_at) values ('${staff}', '${firm}', '${group}', true, true, now())`;
  ok("PF-18a DB fail: a group not among the eight (or SECURITY) is refused", refused(EMPTY, ins(manager.id, firmA, "DIGEST"), /group_check/) && refused(EMPTY, ins(manager.id, firmA, "SECURITY"), /group_check/));
  ok("PF-18a DB fail: a row naming firm B's person under firm A, or a person who does not exist, is refused (the (firm, staff) key)", refused(EMPTY, ins(ownerB.id, firmA, "MY_DEADLINES"), /fkey/) && refused(EMPTY, `insert into platform_notification_preference (staff_id, firm_id, "group", in_app, email, updated_at) values (gen_random_uuid(), '${firmA}', 'MENTIONS', true, true, now())`, /fkey/));
  ok("PF-18a DB fail: one row per person and group (a second MENTIONS row for the officer)", refused(EMPTY, ins(officer.id, firmA, "MENTIONS"), /pkey/));
  ok("PF-18a DB fail: a row's person, firm or group never changes; its switches may", refused(EMPTY, `update platform_notification_preference set "group" = 'NEEDS_YOU' where staff_id = '${officer.id}' and "group" = 'MENTIONS'`, /never change/) && sql(EMPTY, `update platform_notification_preference set email = true where staff_id = '${officer.id}' and "group" = 'MENTIONS' returning email`) === "t");
  ok("PF-18a walls fail: as xr_app a row is never moved to another person (column grant)", refused(EMPTY, `begin; select set_config('app.firm_id', '${firmA}', true); update platform_notification_preference set staff_id = '${owner.id}' where staff_id = '${officer.id}'; commit;`, /permission denied/, "xr_app"));
  ok("PF-18a walls pass: as xr_app with no firm, the table reads nothing; firm A's session reads only firm A's rows", asApp(EMPTY, null, "select count(*) from platform_notification_preference") === "0" && asApp(EMPTY, firmA, `select count(*) from platform_notification_preference where firm_id = '${firmB}'`) === "0" && asApp(EMPTY, firmA, "select count(*) from platform_notification_preference") !== "0");
  ok("PF-18a walls fail: firm A's session writing a row of firm B is refused", refused(EMPTY, `begin; select set_config('app.firm_id', '${firmA}', true); ${ins(ownerB.id, firmB, "NEEDS_YOU")}; commit;`, /row-level security/, "xr_app"));
  ok("PF-18a walls pass: firm A's session saves its own person's switches", asApp(EMPTY, firmA, `${ins(manager.id, firmA, "NEEDS_YOU")} returning "group"`) === "NEEDS_YOU");

  // ------------------------------------------------------------------------------------------------ DW7: the shared contract
  let k = 0;
  const realHarness = async (): Promise<NotificationPrefsHarness> => {
    const mk = async () => (await db.platformFirm.create({ data: { key: `pf18an-c-${++k}`, operatingName: `Contract ${k}`, countryCode: "CA", status: "ACTIVE", contactEmail: `c${k}@pf18an-c.example.com` } })).id;
    const a = await mk(), b = await mk();
    return {
      port: new PrismaNotificationPrefs(db), firmA: a, firmB: b, rules: RULES,
      async person(firmId, holder) {
        const s = await db.platformStaff.create({ data: { firmId, email: `c${++n}@pf18an.example.com`, displayName: `Sample ${n}` } });
        for (const role of holder.roles) await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role: role as Role, grantedBy: "seed:pf18an" } });
        return s.id;
      },
      async set(firmId, staffId, group, s) { await db.platformNotificationPreference.upsert({ where: { staffId_group: { staffId, group } }, create: { firmId, staffId, group, ...s }, update: s }); },
    };
  };
  const fakeHarness = (rules: readonly GroupRule[] = RULES): NotificationPrefsHarness => {
    const f = fakeNotificationPrefs(rules), a = globalThis.crypto.randomUUID(), b = globalThis.crypto.randomUUID();
    // The fake is told each person's keys as the starter roles give them (the real adapter reads them from the role catalogue).
    const keysOf = async (roles: readonly string[]) => (await db.platformRolePermission.findMany({ where: { role: { in: roles as Role[] } }, select: { permissionKey: true } })).map((x) => x.permissionKey);
    return { port: f, firmA: a, firmB: b, rules, async person(firmId, holder) { const id = globalThis.crypto.randomUUID(); f.setPerson(firmId, id, { roles: holder.roles, keys: await keysOf(holder.roles) }); return id; }, async set(firmId, s, g, v) { f.set(firmId, s, g, v); } };
  };
  await runContract(notificationPrefsPortContract, "PrismaNotificationPrefs", realHarness, ok);
  await runContract(notificationPrefsPortContract, "fakeNotificationPrefs", () => fakeHarness(), ok);
  const broken = await runContract(notificationPrefsPortContract, "fakeNotificationPrefs", () => { const h = fakeHarness(); return { ...h, port: { allows: async (f: string, s: string, g: any, c: any) => (c === "EMAIL" && g !== "SECURITY" ? true : h.port.allows(f, s, g, c)) } }; }, null);
  ok("PF-18a DW7 fail: an adapter that ignores the email switch breaks the contract", broken.failed.length > 0, broken);
  const everyone = await runContract(notificationPrefsPortContract, "fakeNotificationPrefs", () => fakeHarness(RULES.map((r) => ({ ...r, whoSeesIt: { kind: "everyone" as const } }))), null);
  ok("PF-18a DW7 fail: rules that let every group reach everyone break the contract (who sees it matters)", everyone.failed.length > 0, everyone);
  ok("PF-18a DW5: groupsFor is pure and agrees with the routes (a Case Officer's keys)", groupsFor(RULES, { roles: ["CASE_OFFICER"], keys: ["agent/invoice:list"] }).join(",") === shown(views.officer));
  const contracts = spawnSync(process.execPath, [join(STUDIO, "tools", "check-port-contracts.mjs")], { cwd: STUDIO, encoding: "utf8" });
  ok("PF-18a DW7 pass: tools/check-port-contracts.mjs passes (NotificationPrefsPort has its contract, both adapters run it)", contracts.status === 0, `${contracts.stdout}${contracts.stderr}`.slice(-600));
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await db.$disconnect(); for (const d of [EMPTY, DEMO]) execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
