// PF-25w (BACKLOG row PF-25w; R1.24; SA-2-27, SA-7-10, SA7-D5, Appendix A of SA-07 v2.17): ExpatReady's own staff change
// a firm's web address through `POST /api/system/firms/:id/web-address` (PF-25's service, PF-4s's system guard, AUD-3a's
// actor word). A pass and a fail per key (system/firm:address: Platform Owner and Admin), a 403 for each role without it,
// a 404 for an id that is no firm's, 401 without a session, a firm's token refused, the reason required, and the change's
// lines: one on our staff's own audit table, one on the firm's trail naming our staff as ourstaff:<id> (OUR_STAFF).
// One process: a scratch database (every migration, PF-3's Sample firms), a small Nest app built from the features' own
// classes (PF-4's guard and routes, PF-4s's guard, PF-25's controllers) with PF-23's request scope. No model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf25w_routes.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf25w_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "pf25w-check/1" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { SystemLocalIdentity } = await import("../api/src/platform/system-identity/local.ts");
const { SYSTEM_IDENTITY_PORT, SystemIdentity } = await import("../api/src/platform/system-identity/service.ts");
const { SystemGuard, SystemPlaneWall } = await import("../api/src/platform/system-identity/guard.ts");
const { SystemIdentityController } = await import("../api/src/platform/system-identity/routes.ts");
const { SystemWebAddressController, WebAddressController, webAddressesProvider } = await import("../api/src/platform/web-address/routes.ts");
const feature = (await import("../api/src/features/platform-web-address.ts")).default;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const firmLocal = new LocalIdentity("pf25w-firm-standin-key-0123456789abcdef", () => clock.now());
const systemLocal = new SystemLocalIdentity("pf25w-system-standin-key-0123456789abc", () => clock.now());

const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
  { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard }, webAddressesProvider];
@Module({ controllers: [PlatformIdentityController, SystemIdentityController, WebAddressController, SystemWebAddressController] as never[], providers: providers as never[] }) class TestApp {}

let app: { close(): Promise<void> } | undefined;
try {
  await seedSampleFirms(db);
  const firmA = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } })).id;
  const nest = await NestFactory.create(TestApp, { logger: false });
  nest.use(requestMiddleware());
  await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;

  const person = async (name: string, roles: string[]) => (await db.platSystemStaff.create({ data: { email: `${name.toLowerCase().replace(/\s+/g, ".")}@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const ROLES = ["platform-owner", "platform-admin", "platform-support", "platform-billing-ops", "platform-content-publisher", "platform-auditor"] as const;
  const staff: Record<string, string> = {};
  for (const r of ROLES) staff[r] = await person(r.replace("platform-", "PF25w "), [r]);
  const tokenOf = async (id: string) => {
    const email = (await db.platSystemStaff.findUniqueOrThrow({ where: { id } })).email;
    const r = await call(base, "POST", "/api/system/session/local", { body: { email, secondStep: true } });
    if (r.status !== 200) throw new Error(`sign-in ${id}: ${JSON.stringify(r.body)}`);
    return r.body.token as string;
  };
  const addressOf = () => sql(`select address from platform_firm_web_address where firm_id = '${firmA}'`);
  const path = (id: string) => `/api/system/firms/${id}/web-address`;
  const ourLines = () => Number(sql(`select count(*) from plat_system_audit`));
  const lastOurs = () => sql(`select outcome || '|' || coalesce(code, '') || '|' || coalesce(reason, '') || '|' || route || '|' || (target->>'id') from plat_system_audit order by at desc, id desc limit 1`);

  ok("PF-25w pass: the feature registers the system route's controller beside PF-25's public one", feature.controllers.includes(SystemWebAddressController as never) && feature.controllers.includes(WebAddressController as never));

  // A pass per role that holds the key (Appendix A: "edit … web address" — Own, Adm).
  const before = addressOf();
  const owner = await tokenOf(staff["platform-owner"]), n0 = ourLines();
  const r1 = await call(base, "POST", path(firmA), { token: owner, body: { address: "pf25w-maple", reason: "The firm renamed itself" } });
  const trail1 = sql(`select actor_type || '|' || actor || '|' || firm_id || '|' || action from audit_event where action = 'firm.web_address.changed' and firm_id = '${firmA}' order by at desc, id desc limit 1`);
  ok("PF-25w DW1 pass (SA-2-27): a Platform Owner with system/firm:address and a reason sets the address (200; this copy's Sample firm had none yet)",
    r1.status === 200 && r1.body.address === "pf25w-maple" && (r1.body.oldAddress ?? "") === before && addressOf() === "pf25w-maple", { r1, before });
  ok("PF-25w DW1 pass (AUD-3a, SA-7-3): the firm's trail names our staff as ourstaff:<id>, OUR_STAFF, on that firm; the history keeps the same word",
    trail1 === `OUR_STAFF|ourstaff:${staff["platform-owner"]}|${firmA}|firm.web_address.changed`
    && sql(`select changed_by from platform_firm_address_history where firm_id = '${firmA}' order by changed_at desc limit 1`) === `ourstaff:${staff["platform-owner"]}`, trail1);
  ok("PF-25w DW1 pass (SA-7-20): exactly one line on our staff's own table, ALLOWED, with the reason, the route pattern and the firm",
    ourLines() - n0 === 1 && lastOurs() === `ALLOWED||The firm renamed itself|/api/system/firms/:id/web-address|${firmA}`, lastOurs());
  const admin = await tokenOf(staff["platform-admin"]);
  const r2 = await call(base, "POST", path(firmA), { token: admin, body: { address: "pf25w-oak", reason: "Asked by the firm's Owner" } });
  ok("PF-25w DW1 pass (SA7-D5, SA-2-27): an Admin also holds the key and changes it (200); the old address redirects for 90 days",
    r2.status === 200 && addressOf() === "pf25w-oak" && r2.body.oldAddress === "pf25w-maple" && !!r2.body.redirectUntil
    && sql(`select count(*) from platform_firm_address_history where firm_id = '${firmA}' and old_address = 'pf25w-maple' and until is not null`) === "1", r2);

  // A fail per role without the key: 403, nothing changed, one REFUSED line each.
  const refused: string[] = [];
  for (const r of ["platform-support", "platform-billing-ops", "platform-content-publisher", "platform-auditor"]) {
    const t = await tokenOf(staff[r]), n = ourLines();
    const x = await call(base, "POST", path(firmA), { token: t, body: { address: "pf25w-pine", reason: "Trying without the key" } });
    if (x.status !== 403 || x.body.code !== "MISSING_PERMISSION" || ourLines() - n !== 1 || !lastOurs().startsWith("REFUSED|MISSING_PERMISSION|")) refused.push(`${r}: ${x.status} ${x.body.code}`);
  }
  ok("PF-25w DW2 fail (Appendix A): Support, Billing, Content publisher and Auditor each get 403 MISSING_PERMISSION, one REFUSED line, the address unchanged",
    refused.length === 0 && addressOf() === "pf25w-oak", refused);

  // 404 for an id that is no firm's; 401 without a session; a firm's own Owner refused.
  const n404 = ourLines();
  const unknown = await call(base, "POST", path("00000000-0000-4000-8000-000000000404"), { token: owner, body: { address: "pf25w-elm", reason: "No such firm" } });
  const notId = await call(base, "POST", path("sample-firm"), { token: owner, body: { address: "pf25w-elm", reason: "A key, not an id" } });
  ok("PF-25w DW3 fail: an id that is no firm's (an unknown uuid, a firm key) is the one 404, nothing changed, one line each",
    unknown.status === 404 && notId.status === 404 && ourLines() - n404 === 2 && addressOf() === "pf25w-oak", { unknown, notId });
  const none = await call(base, "POST", path(firmA), { body: { address: "pf25w-elm", reason: "No session" } });
  const firmToken = (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } })).body.token as string;
  const asFirm = await call(base, "POST", path(firmA), { token: firmToken, body: { address: "pf25w-elm", reason: "The firm's own Owner" } });
  ok("PF-25w DW3 fail (SA-7-1, SA-6-4): no session is 401; a firm's own staff session is 403 (only ExpatReady staff change it after sign-up)",
    none.status === 401 && asFirm.status === 403 && addressOf() === "pf25w-oak", { none, asFirm });

  // The reason and the address.
  const noReason = await call(base, "POST", path(firmA), { token: owner, body: { address: "pf25w-elm" } });
  const badAddress = await call(base, "POST", path(firmA), { token: owner, body: { address: "No Spaces!", reason: "A bad address" } });
  const same = await call(base, "POST", path(firmA), { token: owner, body: { address: "pf25w-oak", reason: "The same one" } });
  ok("PF-25w DW4 fail: no reason is 400 REASON_REQUIRED; a bad address 422 naming the field; the same address 409; nothing changed",
    noReason.status === 400 && noReason.body.code === "REASON_REQUIRED" && badAddress.status === 422 && !!badAddress.body.fields?.address && same.status === 409 && addressOf() === "pf25w-oak", { noReason, badAddress, same });
  ok("PF-25w DW4 pass: no step-up (SA-7-10 does not list it): a sign-in 6 minutes old still changes the address",
    await (async () => { const t = await tokenOf(staff["platform-owner"]); clock.t += 6 * 60_000; const x = await call(base, "POST", path(firmA), { token: t, body: { address: "pf25w-birch", reason: "Later the same day" } }); return x.status === 200 && addressOf() === "pf25w-birch"; })());
} catch (e) {
  ok("the check ran to its end", false, e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e));
} finally {
  await app?.close().catch(() => undefined);
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the cluster's sweep */ }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
