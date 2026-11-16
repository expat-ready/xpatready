// PF-6r (Lead B's brief PF-6r, rev 16.54; R1.6 "money and licence apart"; PF-6b's catalogue): GET /api/platform/roles,
// what each of the six starter roles gives, each key with its class and scope. One named case per Done when line, a pass
// and a fail each:
//   DW1 Billing and finance's money keys come back MONEY and match moneyKeysOfRoles; Read-only has 0 money keys
//   DW2 OWNER and ADMIN 200; CASE_OFFICER and READ_ONLY 403; no token 401; nothing of firm B in firm A's answer
//   DW3 assertEveryRouteDeclared accepts the route and refuses it stripped (PF-4b's and PF-6b's suites run on their own)
// A scratch database with every migration and the Sample firms; a small Nest app of PF-4's and PF-4b's classes with the
// local stand-ins. No server, no browser, no model call (US$0). The database is dropped at the end.
//   tsx studio/tests/check_pf6r_roles_read.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, ModulesContainer, NestFactory, Reflector } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf6r_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard, assertEveryRouteDeclared, platformRoutes } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { moneyKeysOfRoles } = await import("../api/src/platform/identity/catalogue.ts");
const { IDENTITY_ADMIN_PORT, LocalIdentityAdmin } = await import("../api/src/platform/identity/session/provider.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { PlatformSession } = await import("../api/src/platform/identity/session/service.ts");
const { PlatformSessionController, PublicInvitationController } = await import("../api/src/platform/identity/session/routes.ts");
const { StaffReads, STARTER_ROLES } = await import("../api/src/platform/staff-read/service.ts");
const { StaffReadController } = await import("../api/src/platform/staff-read/routes.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pf6r-check-signing-key-0123456789abcdef", () => clock.now());
let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: IDENTITY_ADMIN_PORT, useValue: new LocalIdentityAdmin(() => clock.now()) }, { provide: MAIL_PORT, useValue: fakeMail() }, PlatformSession, StaffReads];
  @Module({ controllers: [PlatformIdentityController, PlatformSessionController, PublicInvitationController, StaffReadController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  await seedSampleFirms(db);
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(base, "POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const staffO = (await db.platformStaff.findFirstOrThrow({ where: { actorId: "user-O" } })).id;
  // The guard reads live grants on every request, so user-O's one grant is switched to try each role.
  const as = (role: string) => sql(`update platform_role_grant set role = '${role}' where staff_id = '${staffO}' and ended_at is null`);
  const tR = await signIn("user-R", "sample-firm"), tO = await signIn("user-O", "sample-firm"), tS = await signIn("user-S", "sample-solo");
  const get = (token?: string) => call(base, "GET", "/api/platform/roles", { token });
  const roleOf = (b: any, r: string) => (b?.roles ?? []).find((x: any) => x.role === r);

  // --------------------------------------------------------------------------------------------------------- DW1
  const a = await get(tR);
  ok("PF-6r DW1 pass: the six starter roles, in the fixed order Owner, Admin, Case Manager, Case Officer, Billing and finance, Read-only",
    a.status === 200 && JSON.stringify(a.body.roles.map((x: any) => x.role)) === JSON.stringify(STARTER_ROLES) && STARTER_ROLES.join() === "OWNER,ADMIN,CASE_MANAGER,CASE_OFFICER,BILLING_FINANCE,READ_ONLY", a.body);
  const bill = roleOf(a.body, "BILLING_FINANCE"), money = await moneyKeysOfRoles(db, ["BILLING_FINANCE"]);
  const billMoney = (bill?.keys ?? []).filter((k: any) => k.class === "MONEY").map((k: any) => k.key).sort();
  ok(`PF-6r DW1 pass: Billing and finance answers its money keys with class MONEY, the same ${money.length} as moneyKeysOfRoles, and moneyKeys = ${money.length}`,
    money.length > 0 && JSON.stringify(billMoney) === JSON.stringify(money) && bill.moneyKeys === money.length, { billMoney, money, moneyKeys: bill?.moneyKeys });
  const dbRows = sql(`select rp.role || ' ' || rp.permission_key || ' ' || k.class || ' ' || k.scope from platform_role_permission rp join platform_permission_key k on k.key = rp.permission_key order by 1`).split("\n");
  const answered = a.body.roles.flatMap((r: any) => r.keys.map((k: any) => `${r.role} ${k.key} ${k.class} ${k.scope}`)).sort();
  ok(`PF-6r DW1 pass: every key of every role, with its class and scope, is exactly the role-permission rows joined to the catalogue (${dbRows.length})`, JSON.stringify(answered) === JSON.stringify(dbRows.sort()), answered.length);
  ok("PF-6r DW1 pass: each role's moneyKeys and licenceKeys count its MONEY and LICENCE keys (Owner and Case Manager 3 licence keys)",
    a.body.roles.every((r: any) => r.moneyKeys === r.keys.filter((k: any) => k.class === "MONEY").length && r.licenceKeys === r.keys.filter((k: any) => k.class === "LICENCE").length)
    && roleOf(a.body, "OWNER").licenceKeys === 3 && roleOf(a.body, "CASE_MANAGER").licenceKeys === 3 && roleOf(a.body, "ADMIN").licenceKeys === 0, a.body.roles.map((r: any) => [r.role, r.moneyKeys, r.licenceKeys]));
  const ro = roleOf(a.body, "READ_ONLY");
  ok("PF-6r DW1 fail: Read-only answers 0 money keys and 0 licence keys (no key of its list is MONEY or LICENCE)",
    ro?.moneyKeys === 0 && ro.licenceKeys === 0 && ro.keys.length > 0 && ro.keys.every((k: any) => k.class === "GENERAL"), ro);
  ok("PF-6r DW1 fail: the answer gives no labels (no name, label or description field anywhere)", !/"(label|name|description|words)"/.test(JSON.stringify(a.body)));
  sql(`insert into platform_role_permission (role, permission_key) values ('READ_ONLY', 'agent/pf6r-test:read')`);
  const lost = await get(tR);
  sql(`delete from platform_role_permission where permission_key = 'agent/pf6r-test:read'`);
  ok("PF-6r DW1 fail: a role key with no catalogue row is a 500, never a key answered without its class", lost.status === 500 && !JSON.stringify(lost.body).includes("pf6r-test"), lost);

  ok("PF-6r DW1 pass: each role's keys are in byte order (collate C), the same on every database", a.body.roles.every((r: any) => { const k = r.keys.map((x: any) => x.key); return JSON.stringify(k) === JSON.stringify([...k].sort()); }));
  sql(`update platform_permission_key set class = 'GENERAL' where key = 'agent/invoice:create'`);
  const hand = await get(tR);
  sql(`update platform_permission_key set class = 'MONEY' where key = 'agent/invoice:create'`);
  ok("PF-6r DW1 fail (break m1): a catalogue row hand-edited to a wrong class (agent/invoice:create GENERAL) is a 500, never answered as GENERAL", hand.status === 500 && !JSON.stringify(hand.body).includes("invoice"), hand.status);
  sql(`insert into platform_role_permission (role, permission_key) values ('READ_ONLY', 'agent/Bad:Key')`);
  const shape = await get(tR);
  sql(`delete from platform_role_permission where permission_key = 'agent/Bad:Key'`);
  ok("PF-6r DW1 fail (break m3): a row the guard ignores (not a firm key's shape) is left out, as the guard does; the read still answers 200", shape.status === 200 && JSON.stringify(shape.body) === JSON.stringify(a.body), shape.status);
  // --------------------------------------------------------------------------------------------------------- DW2
  as("ADMIN"); const admin = await get(tO);
  ok("PF-6r DW2 pass: OWNER (user-R) and ADMIN get 200 with the same answer", a.status === 200 && admin.status === 200 && JSON.stringify(admin.body) === JSON.stringify(a.body), admin.status);
  const denied: number[] = [];
  for (const r of ["CASE_OFFICER", "READ_ONLY", "CASE_MANAGER", "BILLING_FINANCE"]) { as(r); const x = await get(tO); denied.push(x.status === 403 && x.body.code === "MISSING_PERMISSION" ? 403 : x.status); }
  as("CASE_OFFICER");
  ok("PF-6r DW2 fail: CASE_OFFICER and READ_ONLY get 403 MISSING_PERMISSION (and so do Case Manager and Billing and finance, who hold no agent/staff:manage)", denied.every((s) => s === 403), denied);
  const none = await get(), bad = await get("not-a-token");
  ok("PF-6r DW2 fail: no token → 401, a broken token → 401", none.status === 401 && bad.status === 401, [none.status, bad.status]);
  const b = await get(tS);
  const firmB = sql(`select f.id || ' ' || f.key || ' ' || s.id || ' ' || s.email from platform_firm f join platform_staff s on s.firm_id = f.id where f.key = 'sample-solo'`).split(/\s+/);
  const firmA = sql(`select f.id || ' ' || f.key || ' ' || string_agg(s.id::text || ' ' || s.email, ' ') from platform_firm f join platform_staff s on s.firm_id = f.id where f.key = 'sample-firm' group by f.id, f.key`).split(/\s+/);
  ok("PF-6r DW2 fail: nothing of firm B (its id, key, staff ids, emails) appears in firm A's answer, nor firm A's own; the roles are the starter roles every firm shares",
    b.status === 200 && JSON.stringify(b.body) === JSON.stringify(a.body) && [...firmB, ...firmA].every((v) => v && !JSON.stringify(a.body).includes(v)), [b.status, firmB]);

  // --------------------------------------------------------------------------------------------------------- DW3
  const routes = platformRoutes(nest.get(ModulesContainer), nest.get(Reflector));
  const mine = routes.find((r) => r.method === "GET" && r.path === "/api/platform/roles");
  let accepted = true; try { assertEveryRouteDeclared(routes); } catch { accepted = false; }
  ok("PF-6r DW3 pass: GET /api/platform/roles declares agent/staff:manage, and assertEveryRouteDeclared accepts every route", accepted && mine?.access?.kind === "keys" && JSON.stringify((mine.access as { keys: string[] }).keys) === '["agent/staff:manage"]', mine);
  let refused = ""; try { assertEveryRouteDeclared(routes.map((r) => (r === mine ? { ...r, access: undefined } : r))); } catch (e) { refused = String(e); }
  ok("PF-6r DW3 fail: the route list with GET /api/platform/roles stripped of its declaration is refused, naming it", refused.includes("StaffReadController.roles (GET /api/platform/roles)"), refused);

  // -------------------------------------------------------------- break m4 (last: an enum value cannot be dropped)
  sql(`alter type "PlatformRole" add value 'PF6R_SEVENTH'`);
  sql(`insert into platform_role_permission (role, permission_key) values ('PF6R_SEVENTH', 'agent/invoice:create')`);
  const seventh = await get(tR);
  ok("PF-6r DW1 fail (break m4): a seventh role with rows is a 500, never left out of the answer silently", seventh.status === 500, seventh.status);
} finally {
  await app?.close().catch(() => {});
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
